import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { buildCity, buildLights, makeSkyEnvironment } from '../../lib/ecosystemCity'
import { nodeById } from '../../lib/ecosystemData'

/**
 * The Three.js smart-city canvas.
 *
 * Owns the renderer, scene and picking; reports hover/click back through
 * `onHover` / `onSelect` so the surrounding React panel stays declarative.
 */
export default function Ecosystem3DLarge({ onHover, onSelect, focusId }) {
  const hostRef = useRef(null)
  const apiRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(null)

  // keep the latest callbacks without re-creating the scene
  const cbRef = useRef({ onHover, onSelect })
  cbRef.current = { onHover, onSelect }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch (err) {
      setFailed('WebGL is unavailable in this browser.')
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#0d1026', 0.0028)

    const { env, sky } = makeSkyEnvironment(renderer)
    scene.environment = env
    scene.add(sky)

    const camera = new THREE.PerspectiveCamera(46, host.clientWidth / host.clientHeight, 0.5, 1400)
    camera.position.set(88, 86, 112)

    buildLights(scene)

    const city = buildCity()
    scene.add(city.root)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.minDistance = 40
    controls.maxDistance = 340
    controls.maxPolarAngle = Math.PI * 0.487
    controls.target.set(0, 15, 0)
    controls.autoRotate = !reduced
    controls.autoRotateSpeed = 0.28
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(host.clientWidth, host.clientHeight), 0.42, 0.85, 0.22)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    composer.setSize(host.clientWidth, host.clientHeight)

    /* ------------------------------------------------------------ picking -- */
    const ray = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let hovered = null
    let downAt = null

    const highlight = new THREE.Mesh(
      new THREE.RingGeometry(16.5, 18.6, 72),
      new THREE.MeshBasicMaterial({ color: '#00F0FF', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    )
    highlight.rotation.x = -Math.PI / 2
    highlight.position.y = 0.4
    scene.add(highlight)

    const setPointerFromEvent = (e) => {
      const r = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1
    }

    const pick = () => {
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObjects(city.pickable, false)[0]
      return hit?.object?.userData?.node ?? null
    }

    const onPointerMove = (e) => {
      setPointerFromEvent(e)
      const node = pick()
      if (node?.id !== hovered?.id) {
        hovered = node
        renderer.domElement.style.cursor = node ? 'pointer' : 'grab'
        cbRef.current.onHover?.(node ? { ...nodeById(node.id), screen: { x: e.clientX, y: e.clientY } } : null)
      } else if (node) {
        cbRef.current.onHover?.({ ...nodeById(node.id), screen: { x: e.clientX, y: e.clientY } })
      }
    }

    const onPointerLeave = () => {
      hovered = null
      cbRef.current.onHover?.(null)
    }

    const onPointerDown = (e) => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() }
    }

    const onPointerUp = (e) => {
      if (e.button !== 0 || !downAt) return
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y)
      const held = performance.now() - downAt.t
      downAt = null
      if (moved > 6 || held > 500) return // that was an orbit drag, not a click
      setPointerFromEvent(e)
      const node = pick()
      if (node) {
        controls.autoRotate = false
        cbRef.current.onSelect?.(nodeById(node.id))
      }
    }

    const el = renderer.domElement
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerleave', onPointerLeave)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('contextmenu', (e) => e.preventDefault())

    /* ------------------------------------------------------------- loop ---- */
    const clock = new THREE.Clock()
    let raf = 0
    let visible = true

    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.02 })
    io.observe(host)

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = clock.getElapsedTime()
      if (!visible) return
      if (!reduced) city.update(t)
      controls.update()

      // highlight ring follows the hovered / focused node
      const target = hovered || apiRef.current?.focused
      if (target && target.pos) {
        highlight.position.set(target.pos[0], 0.4, target.pos[2])
        const s = target.kind === 'product' ? 0.45 : target.kind === 'landmark' || target.kind === 'layer' ? 0.85 : 1
        highlight.scale.setScalar(s)
        highlight.material.color.set(target.color || '#00F0FF')
        highlight.material.opacity = THREE.MathUtils.lerp(
          highlight.material.opacity,
          0.42 + Math.sin(t * 3) * 0.14,
          0.14
        )
      } else {
        highlight.material.opacity = THREE.MathUtils.lerp(highlight.material.opacity, 0, 0.16)
      }

      composer.render()
    }
    tick()

    /* ----------------------------------------------------------- resize ---- */
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      composer.setSize(w, h)
      bloom.setSize(w, h)
    })
    ro.observe(host)

    /** Smoothly fly the camera to a node and re-target the orbit centre. */
    const flyTo = (node) => {
      if (!node?.pos) return
      const [x, y, z] = node.pos
      const dist = node.kind === 'zone' ? 58 : node.kind === 'product' ? 42 : 96
      const dir = new THREE.Vector3(x, 0, z)
      if (dir.lengthSq() < 1) dir.set(0.7, 0, 1)
      dir.normalize()
      const to = new THREE.Vector3(x, 0, z).add(dir.multiplyScalar(dist)).setY(y + dist * 0.55)
      const targetTo = new THREE.Vector3(x, y + (node.kind === 'layer' ? 0 : 8), z)
      const fromPos = camera.position.clone()
      const fromTarget = controls.target.clone()
      const t0 = performance.now()
      const dur = 900
      controls.autoRotate = false
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / dur)
        const e = 1 - Math.pow(1 - k, 3)
        camera.position.lerpVectors(fromPos, to, e)
        controls.target.lerpVectors(fromTarget, targetTo, e)
        controls.update()
        if (k < 1) requestAnimationFrame(step)
      }
      step()
    }

    const resetView = () => {
      const t0 = performance.now()
      const fromPos = camera.position.clone()
      const fromTarget = controls.target.clone()
      const to = new THREE.Vector3(88, 86, 112)
      const targetTo = new THREE.Vector3(0, 15, 0)
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 900)
        const e = 1 - Math.pow(1 - k, 3)
        camera.position.lerpVectors(fromPos, to, e)
        controls.target.lerpVectors(fromTarget, targetTo, e)
        controls.update()
        if (k < 1) requestAnimationFrame(step)
      }
      step()
    }

    apiRef.current = { flyTo, resetView, controls, focused: null }
    setReady(true)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerleave', onPointerLeave)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      city.dispose()
      composer.dispose?.()
      env.dispose?.()
      renderer.dispose()
      renderer.forceContextLoss?.()
      if (el.parentNode === host) host.removeChild(el)
      apiRef.current = null
    }
  }, [])

  useEffect(() => {
    const node = focusId ? nodeById(focusId) : null
    if (apiRef.current) apiRef.current.focused = node
    if (node) apiRef.current?.flyTo(node)
  }, [focusId])

  const reset = useCallback(() => apiRef.current?.resetView(), [])

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-chalk">{failed}</p>
          <p className="mt-2 text-xs text-muted">Use the zone pills below to filter the gallery instead.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-ink/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-9 w-9 animate-spinSlow rounded-full border-2 border-white/10 border-t-cyan-glow" />
            <p className="label-mono">Compiling city</p>
          </div>
        </div>
      )}
      <button
        onClick={reset}
        className="absolute right-4 top-4 z-10 rounded-lg border border-white/12 bg-[#0b0b10]/80 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted backdrop-blur transition hover:border-cyan-glow/50 hover:text-cyan-glow"
      >
        Reset view
      </button>
    </div>
  )
}
