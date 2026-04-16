import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

function getBarcodeDetectorCtor(): (new (opts?: { formats?: string[] }) => BarcodeDetectorLike) | undefined {
  return (globalThis as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector
}

export function useDemoBarcodeScanner(
  active: boolean,
  onDecode: (value: string) => void,
): { videoRef: RefObject<HTMLVideoElement | null>; error: string | null; hasDetector: boolean } {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasDetector, setHasDetector] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!active) {
      stopStream()
      return
    }

    let cancelled = false
    let intervalId = 0
    setHasDetector(Boolean(getBarcodeDetectorCtor()))

    void (async () => {
      setError(null)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const v = videoRef.current
        if (!v) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        v.srcObject = stream
        v.setAttribute('playsinline', 'true')
        v.muted = true
        await v.play().catch(() => undefined)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(
          msg.toLowerCase().includes('permission') || msg.includes('NotAllowed')
            ? 'Camera permission was denied. Use “Enter code” or allow the camera in browser settings.'
            : 'Could not open the camera. Use “Enter code” for the demo, or try HTTPS / another browser.',
        )
        return
      }

      const Ctor = getBarcodeDetectorCtor()
      if (!Ctor || cancelled) return
      const detector = new Ctor({
        formats: ['qr_code', 'code_128', 'ean_13', 'code_93', 'itf', 'codabar', 'data_matrix', 'aztec'],
      })

      const tick = async () => {
        if (cancelled) return
        const v = videoRef.current
        if (!v || v.readyState < 2) return
        try {
          const codes = await detector.detect(v)
          const raw = codes[0]?.rawValue?.trim()
          if (raw) {
            cancelled = true
            window.clearInterval(intervalId)
            stopStream()
            onDecode(raw)
          }
        } catch {
          /* ignore frame errors */
        }
      }

      intervalId = window.setInterval(() => {
        void tick()
      }, 280)
    })()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      stopStream()
    }
  }, [active, onDecode, stopStream])

  return { videoRef, error, hasDetector }
}
