import { useState, useEffect, useRef } from 'react'
import { supabase, Position, BotConfig, StrategyAccount } from '../lib/supabaseClient'
import { TrendingUp, TrendingDown, XCircle, Activity, Gauge, DollarSign, Layers } from 'lucide-react'

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

interface ManualSignalResult {
  symbol: string
  signal: {
    direction: 'long' | 'short' | 'neutral'
    score: number
    reasons: string[]
    price: number
    atrValue: number
  }
  slMultiplier: number
  tpMultiplier: number
  leverage: number
  alreadyRecorded: boolean
}

const SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', icon: '₿' },
  { symbol: 'ETHUSDT', name: 'Ethereum', icon: 'Ξ' },
  { symbol: 'SOLUSDT', name: 'Solana', icon: '◎' },
]

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20]
const MARGIN_PRESETS = [100, 250, 500, 1000, 2500]

export default function LiveChartAndPnL({ configs, positions, onRefresh }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState<'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT'>('BTCUSDT')
  const [livePrices, setLivePrices] = useState<Record<string, LivePriceData>>({})
  const [actionLoading, setActionLoading] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [signalChecking, setSignalChecking] = useState(false)
  const [signalResult, setSignalResult] = useState<ManualSignalResult | null>(null)
  
  // Kaldıraç ve Teminat Tercihleri
  const [selectedLeverage, setSelectedLeverage] = useState<number>(5)
  const [selectedMargin, setSelectedMargin] = useState<number>(500) // USDT Teminat

  const wsRef = useRef<WebSocket | null>(null)

  // 1. Binance Live WebSocket Ticker
  useEffect(() => {
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

  const commissionPct = Number(activeConfig?.commission_pct || 0.04)

  // Aktif pozisyon kaldıraç ve tutar hesaplamaları
  const posLeverage = activePosition?.leverage || activeConfig?.leverage || 5
  const notionalValue = activePosition ? activePosition.size * activePosition.entry_price : 0
  const currentNotional = activePosition ? activePosition.size * currentPrice : 0
  const initialMargin = notionalValue / posLeverage

  // Komisyon hesaplamaları (%0.04 Taker fee)
  const entryCommission = activePosition ? notionalValue * (commissionPct / 100) : 0
  const estExitCommission = activePosition ? currentNotional * (commissionPct / 100) : 0
  const totalCommission = entryCommission + estExitCommission

  // Canlı PnL & ROE Hesaplamaları
  let grossPnL = 0
  let netPnL = 0
  let priceChangePct = 0
  let grossRoePercent = 0
  let netRoePercent = 0
  let distanceToSL = 0
  let distanceToTP = 0
  let estLiquidationPrice = 0

  if (activePosition && currentPrice > 0) {
    if (activePosition.direction === 'long') {
      grossPnL = (currentPrice - activePosition.entry_price) * activePosition.size
      priceChangePct = ((currentPrice - activePosition.entry_price) / activePosition.entry_price) * 100
      distanceToSL = ((currentPrice - activePosition.stop_loss) / currentPrice) * 100
      distanceToTP = ((activePosition.take_profit - currentPrice) / currentPrice) * 100
      estLiquidationPrice = activePosition.entry_price * (1 - (1 / posLeverage) * 0.9)
    } else {
      grossPnL = (activePosition.entry_price - currentPrice) * activePosition.size
      priceChangePct = ((activePosition.entry_price - currentPrice) / activePosition.entry_price) * 100
      distanceToSL = ((activePosition.stop_loss - currentPrice) / currentPrice) * 100
      distanceToTP = ((currentPrice - activePosition.take_profit) / currentPrice) * 100
      estLiquidationPrice = activePosition.entry_price * (1 + (1 / posLeverage) * 0.9)
    }
    netPnL = grossPnL - totalCommission
    grossRoePercent = priceChangePct * posLeverage
    netRoePercent = initialMargin > 0 ? (netPnL / initialMargin) * 100 : grossRoePercent
  }

  // Yeni açılacak pozisyon simülasyonu
  const plannedNotional = selectedMargin * selectedLeverage
  const plannedQuantity = currentPrice > 0 ? plannedNotional / currentPrice : 0
  const plannedEntryFee = plannedNotional * (commissionPct / 100)
  const plannedRoundTripFee = plannedEntryFee * 2

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
      const notional = selectedMargin * selectedLeverage
      const size = notional / currentPrice
      const slDistance = currentPrice * 0.015 // %1.5 SL mesafesi
      const tpDistance = currentPrice * 0.03  // %3.0 TP mesafesi

      const stopLoss = direction === 'long' ? currentPrice - slDistance : currentPrice + slDistance
      const takeProfit = direction === 'long' ? currentPrice + tpDistance : currentPrice - tpDistance

        const { error } = await supabase.rpc('open_manual_position', {
          p_config_id: activeConfig.id,
          p_symbol: selectedSymbol,
          p_direction: direction,
          p_entry_price: currentPrice,
          p_size: size,
          p_stop_loss: stopLoss,
          p_take_profit: takeProfit,
          p_leverage: selectedLeverage,
      })

      if (error) throw error

      setActionNotice(`✓ ${selectedSymbol} için ${selectedLeverage}x kaldıraçla $${notional.toLocaleString()} tutarında ${direction.toUpperCase()} pozisyonu açıldı! (Teminat: $${selectedMargin})`)
      setTimeout(() => setActionNotice(null), 6000)
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
        const { data: closeResult, error } = await supabase.rpc('close_manual_position', {
          p_position_id: activePosition.id,
          p_exit_price: currentPrice,
      })
        if (error) throw error
        const finalNetPnl = Number(closeResult.net_pnl)
        const totalTradeCommission = Number(closeResult.commission)

      setActionNotice(`✓ Pozisyon kapatıldı! Net PnL: ${finalNetPnl >= 0 ? '+' : ''}$${finalNetPnl.toFixed(2)} (Toplam Komisyon: -$${totalTradeCommission.toFixed(3)})`)
      setTimeout(() => setActionNotice(null), 6000)
      onRefresh()
    } catch (err: any) {
      alert(`Kapatma hatası: ${err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  async function checkSignalNow() {
    if (!activeConfig) return
    setSignalChecking(true)
    setSignalResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('manual-signal-check', {
        body: { config_id: activeConfig.id },
      })
      if (error) throw error
      setSignalResult(data as ManualSignalResult)
    } catch (err: any) {
      setActionNotice(`Sinyal kontrolü başarısız: ${err.message}`)
      setTimeout(() => setActionNotice(null), 6000)
    } finally {
      setSignalChecking(false)
    }
  }

  async function openApprovedSignalPosition() {
    if (!signalResult || !activeConfig || currentPrice <= 0 || activePosition) return
    const { signal } = signalResult
    if (signal.direction === 'neutral' || signal.atrValue <= 0) return

    const leverage = signalResult.leverage
    const notional = selectedMargin * leverage
    const size = notional / currentPrice
    const slDistance = signal.atrValue * signalResult.slMultiplier
    const tpDistance = signal.atrValue * signalResult.tpMultiplier
    const stopLoss = signal.direction === 'long' ? currentPrice - slDistance : currentPrice + slDistance
    const takeProfit = signal.direction === 'long' ? currentPrice + tpDistance : currentPrice - tpDistance

    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('open_manual_position', {
        p_config_id: activeConfig.id,
        p_symbol: selectedSymbol,
        p_direction: signal.direction,
        p_entry_price: currentPrice,
        p_size: size,
        p_stop_loss: stopLoss,
        p_take_profit: takeProfit,
        p_leverage: leverage,
      })
      if (error) throw error
      setActionNotice(`✓ ${signal.direction.toUpperCase()} sinyali onaylandı ve pozisyon açıldı.`)
      setSignalResult(null)
      setTimeout(() => setActionNotice(null), 6000)
      onRefresh()
    } catch (err: any) {
      setActionNotice(`Pozisyon açılamadı: ${err.message}`)
      setTimeout(() => setActionNotice(null), 6000)
    } finally {
      setActionLoading(false)
    }
  }

  async function closeOnReverseSignal() {
    if (!signalResult || !activePosition || currentPrice <= 0) return
    const reverseDirection = activePosition.direction === 'long' ? 'short' : 'long'
    if (signalResult.signal.direction !== reverseDirection) return
    if (!confirm(`${reverseDirection.toUpperCase()} ters sinyali geldi. Açık pozisyonu canlı fiyatla kapatmak istiyor musunuz?`)) return

    setActionLoading(true)
    try {
      const { data: closeResult, error } = await supabase.rpc('close_manual_position', {
        p_position_id: activePosition.id,
        p_exit_price: currentPrice,
      })
      if (error) throw error
      const netPnl = Number(closeResult.net_pnl)
      setActionNotice(`✓ Ters sinyal ile pozisyon kapatıldı. Net PnL: ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}`)
      setSignalResult(null)
      setTimeout(() => setActionNotice(null), 6000)
      onRefresh()
    } catch (err: any) {
      setActionNotice(`Ters sinyal kapatması başarısız: ${err.message}`)
      setTimeout(() => setActionNotice(null), 6000)
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
          {SYMBOLS.map(({ symbol, icon }) => {
            const isSelected = selectedSymbol === symbol
            const symPrice = livePrices[symbol]?.price
            const symChange = livePrices[symbol]?.change24h || 0
            const pos = positions.find(p => p.symbol === symbol && p.status === 'open')

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
                    {pos && (
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: pos.direction === 'long' ? 'rgba(16,217,160,0.2)' : 'rgba(244,63,94,0.2)',
                        color: pos.direction === 'long' ? 'var(--accent-green)' : 'var(--accent-red)',
                        fontWeight: 700
                      }}>
                        {pos.leverage || 5}x {pos.direction.toUpperCase()}
                      </span>
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

        {/* Canlı WebSocket Rozeti */}
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

      {/* Grid: Sol Taraf TradingView Canlı Mum Grafiği (2 birim), Sağ Taraf Kaldıraç, Tutar & Pozisyon Paneli (1 birim) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(340px, 1fr)',
        gap: 18,
      }}>
        {/* Canlı TradingView Mum Grafiği */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 520, display: 'flex', flexDirection: 'column' }}>
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
              {activePosition && (
                <span style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 700,
                  background: activePosition.direction === 'long' ? 'rgba(16,217,160,0.2)' : 'rgba(244,63,94,0.2)',
                  color: activePosition.direction === 'long' ? 'var(--accent-green)' : 'var(--accent-red)'
                }}>
                  {posLeverage}x KALDIRAÇLI POZİSYON AKTİF
                </span>
              )}
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

          <div style={{ flex: 1, width: '100%', minHeight: 460 }}>
            <iframe
              key={selectedSymbol}
              src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=BINANCE%3A${selectedSymbol}&interval=15&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=131d35&studies=%5B%22MASimple%40tv-basicstudies%22%2C%22RSI%40tv-basicstudies%22%5D&theme=dark&style=1&timezone=Europe%2FIstanbul&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=tr`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={`TradingView ${selectedSymbol}`}
            />
          </div>
        </div>

        {/* Sağ Panel: Kaldıraç, İşlem Büyüklüğü ve Anlık Kâr/Zarar Monitörü */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={18} color="var(--accent-blue)" />
                Pozisyon & Kaldıraç Durumu
              </h3>
              {activePosition ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(245,158,11,0.2)',
                    color: 'var(--accent-yellow)',
                    fontWeight: 700
                  }}>
                    {posLeverage}x İZOLE
                  </span>
                  <span className={`badge badge-${activePosition.direction}`}>
                    {activePosition.direction.toUpperCase()}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Açık İşlem Yok</span>
              )}
            </div>

              <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(59,130,246,0.06)' }}>
                <button
                  onClick={checkSignalNow}
                  disabled={signalChecking || actionLoading}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 7, border: '1px solid var(--accent-blue)', background: 'rgba(59,130,246,0.12)', color: 'var(--accent-blue)', fontWeight: 700, cursor: signalChecking || actionLoading ? 'not-allowed' : 'pointer' }}
                >
                  {signalChecking ? 'Piyasa Taranıyor...' : 'Sinyali Şimdi Kontrol Et'}
                </button>
                {signalResult && (
                  <div style={{ marginTop: 10, fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{signalResult.signal.direction.toUpperCase()}</strong>
                      <span>Skor: {signalResult.signal.score}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginTop: 5 }}>
                      {signalResult.signal.reasons.join(' · ') || 'Yeterli confluence oluşmadı.'}
                    </div>
                    {signalResult.signal.direction !== 'neutral' && (
                      activePosition ? (
                        signalResult.signal.direction !== activePosition.direction && (
                          <button
                            onClick={closeOnReverseSignal}
                            disabled={actionLoading}
                            style={{ width: '100%', marginTop: 9, padding: '9px 12px', borderRadius: 7, border: 'none', background: 'var(--accent-yellow)', color: '#1a1300', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                          >
                            {actionLoading ? 'Pozisyon Kapatılıyor...' : 'Ters Sinyalle Kapat'}
                          </button>
                        )
                      ) : (
                        <button
                          onClick={openApprovedSignalPosition}
                          disabled={actionLoading}
                          style={{ width: '100%', marginTop: 9, padding: '9px 12px', borderRadius: 7, border: 'none', background: 'var(--accent-green)', color: '#07131a', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                        >
                          {actionLoading ? 'Pozisyon Açılıyor...' : `${signalResult.signal.direction.toUpperCase()} Sinyalini Onayla ve Aç`}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

            {/* POZİSYON VARSA: Kaldıraç, Net Tutar ve Canlı ROE Monitörü */}
            {activePosition ? (
              <div>
                {/* Büyük PnL & ROE Göstergesi (Komisyon Dahil Net) */}
                <div style={{
                  background: netPnL >= 0 ? 'rgba(16, 217, 160, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                  border: `1px solid ${netPnL >= 0 ? 'rgba(16, 217, 160, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  borderRadius: 12,
                  padding: '16px 14px',
                  textAlign: 'center',
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                    CANLI NET KÂR / ZARAR (Komisyon Düşülmüş)
                  </div>
                  <div style={{
                    fontSize: '1.9rem',
                    fontWeight: 800,
                    color: netPnL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                    letterSpacing: '-0.02em',
                  }}>
                    {netPnL >= 0 ? '+' : ''}${netPnL.toFixed(2)}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    color: netRoePercent >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                    marginTop: 2
                  }}>
                    <span>{netRoePercent >= 0 ? '+' : ''}{netRoePercent.toFixed(2)}% Net ROE</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      ({posLeverage}x kaldıraç ile)
                    </span>
                  </div>
                  <div style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    justifyContent: 'space-around'
                  }}>
                    <span>Brüt PnL: <strong style={{ color: grossPnL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>${grossPnL >= 0 ? '+' : ''}${grossPnL.toFixed(2)}</strong></span>
                    <span>Toplam Komisyon: <strong style={{ color: 'var(--accent-yellow)' }}>-${totalCommission.toFixed(3)} USDT</strong></span>
                  </div>
                </div>

                {/* Pozisyon Büyüklüğü, Kaldıraç ve Komisyon Ayrıntı Kartı */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 14,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  fontSize: '0.8rem'
                }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Toplam İşlem Tutarı (Notional)</div>
                    <div style={{ fontWeight: 800, color: 'var(--accent-blue)', fontSize: '0.95rem', marginTop: 2 }}>
                      ${notionalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {activePosition.size.toFixed(4)} {selectedSymbol.replace('USDT','')}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kullanılan Teminat (Margin)</div>
                    <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem', marginTop: 2 }}>
                      ${initialMargin.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-yellow)' }}>
                      {posLeverage}x Kaldıraç ile
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Ödenen Giriş Komisyonu</div>
                    <div style={{ fontWeight: 700, marginTop: 1, color: 'var(--accent-yellow)' }}>
                      ${entryCommission.toFixed(3)} USDT
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>%{commissionPct} Taker</div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Tahmini Çıkış Komisyonu</div>
                    <div style={{ fontWeight: 700, marginTop: 1, color: 'var(--accent-yellow)' }}>
                      ${estExitCommission.toFixed(3)} USDT
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Anlık piyasadan</div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Giriş Fiyatı</div>
                    <div style={{ fontWeight: 700, marginTop: 1 }}>${activePosition.entry_price.toLocaleString()}</div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Anlık Fiyat</div>
                    <div style={{ fontWeight: 700, marginTop: 1, color: isUp ? 'var(--accent-green)' : isDown ? 'var(--accent-red)' : '#fff' }}>
                      ${currentPrice.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Risk Seviyeleri: SL, TP ve Tahmini Likidasyon Fiyatı */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: '0.75rem', marginBottom: 16 }}>
                  <div style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                    <div style={{ color: 'var(--accent-red)', fontWeight: 600 }}>Stop Loss</div>
                    <div style={{ fontWeight: 700, marginTop: 2 }}>${activePosition.stop_loss.toLocaleString()}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{distanceToSL.toFixed(1)}%</div>
                  </div>

                  <div style={{ background: 'rgba(16, 217, 160, 0.08)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(16, 217, 160, 0.2)' }}>
                    <div style={{ color: 'var(--accent-green)', fontWeight: 600 }}>Take Profit</div>
                    <div style={{ fontWeight: 700, marginTop: 2 }}>${activePosition.take_profit.toLocaleString()}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{distanceToTP.toFixed(1)}%</div>
                  </div>

                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>Tahmini Likidasyon</div>
                    <div style={{ fontWeight: 700, marginTop: 2 }}>${estLiquidationPrice.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>İzole Risk</div>
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
              /* POZİSYON YOKSA: Kaldıraç Seçici ve İşlem Büyüklüğü Ayarı */
              <div>
                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: 10,
                  padding: '16px',
                  marginBottom: 16,
                  border: '1px solid var(--border)'
                }}>
                  {/* 1. Kaldıraç Seçimi */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Gauge size={14} color="var(--accent-yellow)" />
                        <strong>Kaldıraç Çarpanı (Leverage):</strong>
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-yellow)' }}>
                        {selectedLeverage}x Kaldıraç
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                      {LEVERAGE_OPTIONS.map(lev => (
                        <button
                          key={lev}
                          type="button"
                          onClick={() => setSelectedLeverage(lev)}
                          style={{
                            padding: '6px 0',
                            borderRadius: 6,
                            border: selectedLeverage === lev ? '1px solid var(--accent-yellow)' : '1px solid var(--border)',
                            background: selectedLeverage === lev ? 'rgba(245,158,11,0.2)' : 'var(--bg-card)',
                            color: selectedLeverage === lev ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            transition: 'all 0.1s'
                          }}
                        >
                          {lev}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Teminat (Margin) Seçimi */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <DollarSign size={14} color="var(--accent-blue)" />
                        <strong>Kullanılacak Teminat (Margin):</strong>
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-blue)' }}>
                        ${selectedMargin} USDT
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                      {MARGIN_PRESETS.map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSelectedMargin(m)}
                          style={{
                            padding: '6px 0',
                            borderRadius: 6,
                            border: selectedMargin === m ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                            background: selectedMargin === m ? 'rgba(59,130,246,0.2)' : 'var(--bg-card)',
                            color: selectedMargin === m ? 'var(--accent-blue)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            transition: 'all 0.1s'
                          }}
                        >
                          ${m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Hesaplanan Toplam Pozisyon ve Komisyon Özeti */}
                  <div style={{
                    background: 'var(--bg-card)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 16,
                    border: '1px solid rgba(59,130,246,0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Toplam Açılacak İşlem Büyüklüğü</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-blue)', marginTop: 1 }}>
                          ${plannedNotional.toLocaleString('tr-TR')} USDT
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Miktar ({selectedSymbol.replace('USDT','')})</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 1 }}>
                          {plannedQuantity > 0 ? plannedQuantity.toFixed(4) : '...'}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      borderTop: '1px solid var(--border)',
                      paddingTop: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.75rem'
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Tahmini Giriş Komisyonu (%{commissionPct} Taker):
                      </span>
                      <strong style={{ color: 'var(--accent-yellow)' }}>
                        ${plannedEntryFee.toFixed(3)} USDT
                      </strong>
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)'
                    }}>
                      <span>Tahmini Çift Yönlü Komisyon (Giriş + Çıkış):</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>${plannedRoundTripFee.toFixed(3)} USDT</span>
                    </div>
                  </div>

                  {/* Long / Short Butonları */}
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
                      {selectedLeverage}x LONG Aç
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
                      {selectedLeverage}x SHORT Aç
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}>
            <span>Mevcut Bakiye: ${Number(activeConfig?.account?.balance || 10000).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
            <span>Varsayılan Bot Kaldıracı: {activeConfig?.leverage || 5}x</span>
          </div>
        </div>
      </div>
    </div>
  )
}
