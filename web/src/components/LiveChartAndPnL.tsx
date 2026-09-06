import { useState, useEffect, useRef } from 'react'
import { supabase, Position, BotConfig, StrategyAccount } from '../lib/supabaseClient'
import { TrendingUp, TrendingDown, Play, XCircle, AlertCircle, ShieldAlert, Target, DollarSign, Activity } from 'lucide-react'

interface LivePriceData {
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
  prevPrice?: number
}

interface Props {
  configs: (BotConfig & { account?: StrategyAccount })[]
  positions: Position[]
  onRefresh: () => void
}

const SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', icon: '₿' },
  { symbol: 'ETHUSDT', name: 'Ethereum', icon: 'Ξ' },
  { symbol: 'SOLUSDT', name: 'Solana', icon: '◎' },
]

export default function LiveChartAndPnL({ configs, positions, onRefresh }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState<'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT'>('BTCUSDT')
  const [livePrices, setLivePrices] = useState<Record<string, LivePriceData>>({})
  const [actionLoading, setActionLoading] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // 1. Binance Live WebSocket Ticker
  useEffect(() => {
    // İlk değerleri REST API'den hızlıca doldur
    async function fetchInitialTickers() {
      try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT"]')
        const arr = await res.json()
        const initialMap: Record<string, LivePriceData> = {}
        for (const item of arr) {
          initialMap[item.symbol] = {
            price: parseFloat(item.lastPrice),
            change24h: parseFloat(item.priceChangePercent),
            high24h: parseFloat(item.highPrice),
            low24h: parseFloat(item.lowPrice),
            volume24h: parseFloat(item.volume),
          }
        }
        setLivePrices(prev => ({ ...initialMap, ...prev }))
      } catch (err) {
        console.warn('Initial ticker error:', err)
      }
    }
    fetchInitialTickers()

    // Canlı WebSocket bağlantısı
    const streamNames = 'btcusdt@ticker/ethusdt@ticker/solusdt@ticker'
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamNames}`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data)
        const symbol = d.s
        if (!symbol) return

        const newPrice = parseFloat(d.c)
        setLivePrices(prev => {
          const current = prev[symbol]
          return {
            ...prev,
            [symbol]: {
              price: newPrice,
              change24h: parseFloat(d.P),
              high24h: parseFloat(d.h),
              low24h: parseFloat(d.l),
              volume24h: parseFloat(d.v),
              prevPrice: current?.price ?? newPrice,
            }
          }
        })
      } catch (e) {
        console.error('WS parse error:', e)
      }
    }

    ws.onerror = (e) => console.warn('Binance WS error:', e)

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
  }, [])

  const currentPriceData = livePrices[selectedSymbol]
  const currentPrice = currentPriceData?.price || 0
  const activePosition = positions.find(p => p.symbol === selectedSymbol && p.status === 'open')
  const activeConfig = configs.find(c => c.symbol === selectedSymbol)

  // Canlı PnL Hesaplamaları
  let unrealizedPnL = 0
  let pnlPercent = 0
  let distanceToSL = 0
  let distanceToTP = 0

  if (activePosition && currentPrice > 0) {
    if (activePosition.direction === 'long') {
      unrealizedPnL = (currentPrice - activePosition.entry_price) * activePosition.size
      pnlPercent = ((currentPrice - activePosition.entry_price) / activePosition.entry_price) * 100
      distanceToSL = ((currentPrice - activePosition.stop_loss) / currentPrice) * 100
      distanceToTP = ((activePosition.take_profit - currentPrice) / currentPrice) * 100
    } else {
      unrealizedPnL = (activePosition.entry_price - currentPrice) * activePosition.size
      pnlPercent = ((activePosition.entry_price - currentPrice) / activePosition.entry_price) * 100
      distanceToSL = ((activePosition.stop_loss - currentPrice) / currentPrice) * 100
      distanceToTP = ((currentPrice - activePosition.take_profit) / currentPrice) * 100
    }
  }

  // Fiyat değişim rengi (ani tick)
  const isUp = currentPriceData?.prevPrice && currentPrice > currentPriceData.prevPrice
  const isDown = currentPriceData?.prevPrice && currentPrice < currentPriceData.prevPrice

  // Test Pozisyonu Aç
  async function openTestPosition(direction: 'long' | 'short') {
    if (currentPrice <= 0 || !activeConfig) {
      alert('Canlı fiyat bekleniyor...')
      return
    }
    setActionLoading(true)
    try {
      const balance = Number(activeConfig.account?.balance || 10000)
      const riskAmount = balance * (Number(activeConfig.risk_per_trade_pct || 2) / 100)
      const slDistance = currentPrice * 0.015 // %1.5 SL mesafesi
      const tpDistance = currentPrice * 0.03  // %3.0 TP mesafesi
      const size = riskAmount / slDistance

      const stopLoss = direction === 'long' ? currentPrice - slDistance : currentPrice + slDistance
      const takeProfit = direction === 'long' ? currentPrice + tpDistance : currentPrice - tpDistance

      // Supabase positions tablosuna ekle
      const { error } = await supabase.from('positions').insert({
        config_id: activeConfig.id,
        symbol: selectedSymbol,
        direction,
        entry_price: currentPrice,
        size,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        status: 'open',
      })

      if (error) throw error

      setActionNotice(`✓ ${selectedSymbol} için ${direction.toUpperCase()} pozisyonu $${currentPrice.toLocaleString()} fiyattan açıldı!`)
      setTimeout(() => setActionNotice(null), 5000)
      onRefresh()
    } catch (err: any) {
      alert(`Pozisyon açma hatası: ${err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  // Pozisyonu Anlık Kapat
  async function closePosition() {
    if (!activePosition || currentPrice <= 0 || !activeConfig) return
    if (!confirm('Pozisyonu anlık piyasa fiyatından kapatmak istediğinize emin misiniz?')) return

    setActionLoading(true)
    try {
      // 1. Pozisyonu kapat
      await supabase.from('positions').update({ status: 'closed' }).eq('id', activePosition.id)

      // 2. Trade tablosuna kaydet
      const commission = currentPrice * activePosition.size * 0.0004
      const netPnl = unrealizedPnL - commission
      const startBal = Number(activeConfig.account?.starting_balance || 10000)
      const pnlPct = (netPnl / startBal) * 100

      await supabase.from('trades').insert({
        position_id: activePosition.id,
        config_id: activePosition.config_id,
        symbol: selectedSymbol,
        direction: activePosition.direction,
        entry_price: activePosition.entry_price,
        exit_price: currentPrice,
        size: activePosition.size,
        pnl: netPnl,
        pnl_pct: pnlPct,
        commission,
        exit_reason: 'manual_market_close',
        opened_at: activePosition.opened_at,
      })

      // 3. Hesap bakiyesini güncelle
      const newBal = Number(activeConfig.account?.balance || 10000) + netPnl
      await supabase.from('strategy_accounts').update({
        balance: newBal,
        updated_at: new Date().toISOString()
      }).eq('config_id', activeConfig.id)

      // 4. Equity snapshot ekle
      await supabase.from('equity_snapshots').insert({
        config_id: activeConfig.id,
        balance: newBal,
      })

      setActionNotice(`✓ Pozisyon kapatıldı! Realize Net PnL: ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}`)
      setTimeout(() => setActionNotice(null), 6000)
      onRefresh()
    } catch (err: any) {
      alert(`Kapatma hatası: ${err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Parite Seçim Sekmeleri */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16
      }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {SYMBOLS.map(({ symbol, name, icon }) => {
            const isSelected = selectedSymbol === symbol
            const symPrice = livePrices[symbol]?.price
            const symChange = livePrices[symbol]?.change24h || 0
            const hasPos = positions.some(p => p.symbol === symbol && p.status === 'open')

            return (
              <button
                key={symbol}
                onClick={() => setSelectedSymbol(symbol as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                  background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-card)',
                  color: isSelected ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  position: 'relative',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{symbol}</span>
                    {hasPos && (
                      <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: 'var(--accent-yellow)',
                        boxShadow: '0 0 6px var(--accent-yellow)'
                      }} />
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 500, color: symChange >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {symPrice ? `$${symPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '...'}
                    {' '}({symChange >= 0 ? '+' : ''}{symChange.toFixed(2)}%)
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Canlı Binance WebSocket Durum Rozeti */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.8rem',
          padding: '6px 14px',
          borderRadius: 20,
          background: 'rgba(16, 217, 160, 0.1)',
          border: '1px solid rgba(16, 217, 160, 0.25)',
          color: 'var(--accent-green)'
        }}>
          <div className="live-dot" />
          <span>Binance Canlı WebSocket (Anlık Ticker)</span>
        </div>
      </div>

      {actionNotice && (
        <div style={{
          padding: '12px 18px',
          background: 'rgba(16, 217, 160, 0.15)',
          border: '1px solid rgba(16, 217, 160, 0.35)',
          borderRadius: 8,
          marginBottom: 16,
          color: 'var(--accent-green)',
          fontSize: '0.9rem',
          fontWeight: 600
        }}>
          {actionNotice}
        </div>
      )}

      {/* Grid: Sol Taraf TradingView Canlı Mum Grafiği (2 birim), Sağ Taraf Anlık Kâr/Zarar ve Pozisyon Paneli (1 birim) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
        gap: 18,
      }}>
        {/* Canlı TradingView Mum Grafiği */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', height: 500, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-secondary)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedSymbol} / USDT</span>
              <span style={{ fontSize: '0.75rem', background: 'rgba(59,130,246,0.2)', color: 'var(--accent-blue)', padding: '2px 8px', borderRadius: 4 }}>
                15 Dakikalık (15m)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                color: isUp ? 'var(--accent-green)' : isDown ? 'var(--accent-red)' : 'var(--text-primary)',
                transition: 'color 0.2s'
              }}>
                ${currentPrice > 0 ? currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '...'}
              </span>
              <span style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: (currentPriceData?.change24h || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'
              }}>
                {(currentPriceData?.change24h || 0) >= 0 ? '+' : ''}{(currentPriceData?.change24h || 0).toFixed(2)}%
              </span>
            </div>
          </div>

          <div style={{ flex: 1, width: '100%', height: '100%' }}>
            <iframe
              key={selectedSymbol}
              src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=BINANCE%3A${selectedSymbol}&interval=15&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=131d35&studies=%5B%22MASimple%40tv-basicstudies%22%2C%22RSI%40tv-basicstudies%22%5D&theme=dark&style=1&timezone=Europe%2FIstanbul&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=tr`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={`TradingView ${selectedSymbol}`}
            />
          </div>
        </div>

        {/* Sağ Panel: Anlık Kâr / Zarar & Pozisyon Yönetimi */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={18} color="var(--accent-blue)" />
                Anlık Pozisyon & PnL
              </h3>
              {activePosition ? (
                <span className={`badge badge-${activePosition.direction}`}>
                  {activePosition.direction.toUpperCase()} AÇIK
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pozisyon Yok</span>
              )}
            </div>

            {/* Pozisyon Varsa: Canlı Kâr/Zarar Göstergesi */}
            {activePosition ? (
              <div>
                {/* Büyük PnL Göstergesi */}
                <div style={{
                  background: unrealizedPnL >= 0 ? 'rgba(16, 217, 160, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                  border: `1px solid ${unrealizedPnL >= 0 ? 'rgba(16, 217, 160, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  borderRadius: 12,
                  padding: '20px 16px',
                  textAlign: 'center',
                  marginBottom: 18,
                }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    ANLIK GERÇEKLEŞMEMİŞ PnL
                  </div>
                  <div style={{
                    fontSize: '2rem',
                    fontWeight: 800,
                    color: unrealizedPnL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                    letterSpacing: '-0.02em',
                  }}>
                    {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)}
                  </div>
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: pnlPercent >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                    marginTop: 2
                  }}>
                    {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                  </div>
                </div>

                {/* Detay Bilgileri */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.82rem', marginBottom: 18 }}>
                  <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 8 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Giriş Fiyatı</div>
                    <div style={{ fontWeight: 700, marginTop: 2 }}>${activePosition.entry_price.toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 8 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Anlık Fiyat</div>
                    <div style={{ fontWeight: 700, marginTop: 2, color: isUp ? 'var(--accent-green)' : isDown ? 'var(--accent-red)' : '#fff' }}>
                      ${currentPrice.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                    <div style={{ color: 'var(--accent-red)', fontSize: '0.75rem' }}>Stop Loss (SL)</div>
                    <div style={{ fontWeight: 700, marginTop: 2 }}>${activePosition.stop_loss.toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
                      {distanceToSL.toFixed(1)}% mesafe
                    </div>
                  </div>
                  <div style={{ background: 'rgba(16, 217, 160, 0.08)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(16, 217, 160, 0.2)' }}>
                    <div style={{ color: 'var(--accent-green)', fontSize: '0.75rem' }}>Take Profit (TP)</div>
                    <div style={{ fontWeight: 700, marginTop: 2 }}>${activePosition.take_profit.toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
                      {distanceToTP.toFixed(1)}% mesafe
                    </div>
                  </div>
                </div>

                {/* SL / Fiyat / TP Mesafe Çubuğu */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span>SL: ${activePosition.stop_loss.toFixed(0)}</span>
                    <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Fiyat: ${currentPrice.toFixed(0)}</span>
                    <span>TP: ${activePosition.take_profit.toFixed(0)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                      flex: Math.max(0, Math.min(100, (currentPrice - activePosition.stop_loss) / (activePosition.take_profit - activePosition.stop_loss) * 100)),
                      background: unrealizedPnL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                      transition: 'all 0.3s'
                    }} />
                  </div>
                </div>

                {/* Pozisyonu Kapat Butonu */}
                <button
                  onClick={closePosition}
                  disabled={actionLoading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent-red)',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontSize: '0.9rem',
                    boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)'
                  }}
                >
                  <XCircle size={18} />
                  {actionLoading ? 'İşleniyor...' : 'Pozisyonu Piyasa Fiyatından Kapat'}
                </button>
              </div>
            ) : (
              /* Pozisyon Yoksa: Hızlı Test Pozisyonu Açma Bölümü */
              <div>
                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: 10,
                  padding: '16px',
                  marginBottom: 16,
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Şu anda <strong>{selectedSymbol}</strong> için açık pozisyon bulunmuyor.
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 14 }}>
                    Anlık kâr/zarar akışını canlı grafiğe bağlı olarak test etmek için hemen o anki canlı Binance fiyatından bir Paper Trading pozisyonu açabilirsiniz:
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      onClick={() => openTestPosition('long')}
                      disabled={actionLoading}
                      style={{
                        padding: '12px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'linear-gradient(135deg, #10d9a0 0%, #059669 100%)',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: '0.88rem',
                        boxShadow: '0 4px 12px rgba(16, 217, 160, 0.25)'
                      }}
                    >
                      <TrendingUp size={16} />
                      🟢 Canlı LONG Aç
                    </button>

                    <button
                      onClick={() => openTestPosition('short')}
                      disabled={actionLoading}
                      style={{
                        padding: '12px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: '0.88rem',
                        boxShadow: '0 4px 12px rgba(244, 63, 94, 0.25)'
                      }}
                    >
                      <TrendingDown size={16} />
                      🔴 Canlı SHORT Aç
                    </button>
                  </div>
                </div>

                {/* 24 Saatlik Özet Kartı */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  fontSize: '0.78rem'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>24s En Yüksek:</span>
                    <strong style={{ display: 'block', color: 'var(--text-primary)', marginTop: 2 }}>
                      ${currentPriceData?.high24h ? currentPriceData.high24h.toLocaleString() : '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>24s En Düşük:</span>
                    <strong style={{ display: 'block', color: 'var(--text-primary)', marginTop: 2 }}>
                      ${currentPriceData?.low24h ? currentPriceData.low24h.toLocaleString() : '—'}
                    </strong>
                  </div>
                  <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>24s Hacim:</span>
                    <strong style={{ display: 'block', color: 'var(--text-primary)', marginTop: 2 }}>
                      {currentPriceData?.volume24h ? `${currentPriceData.volume24h.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${selectedSymbol.replace('USDT','')}` : '—'}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}>
            <span>Bakiye: ${Number(activeConfig?.account?.balance || 10000).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
            <span>Risk/İşlem: %{activeConfig?.risk_per_trade_pct || 2}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
