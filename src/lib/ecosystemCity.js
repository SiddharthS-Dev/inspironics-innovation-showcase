/**
 * Three.js builders for the Ecosystem Explorer smart city.
 *
 * Everything here is pure scene construction — no React. `buildCity()` returns the
 * root group plus the list of pickable meshes (each carrying `userData.node`) and
 * an `update(t, dt)` hook the render loop calls for drones, rotors and conduit flow.
 */
import * as THREE from 'three'
import { ZONES, PRODUCT_NODES, STACK_LAYERS, CONDUITS, CY, EM } from './ecosystemData.js'

/* ------------------------------------------------------------------ sky ---- */

/** Golden-hour gradient painted to a canvas, then turned into an equirect env map. */
export function makeSkyEnvironment(renderer) {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 512
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, c.height)
  g.addColorStop(0.0, '#0a1330')
  g.addColorStop(0.35, '#2a3a6b')
  g.addColorStop(0.58, '#8a6ea0')
  g.addColorStop(0.74, '#e59a5c')
  g.addColorStop(0.86, '#ffc27a')
  g.addColorStop(1.0, '#2a1b18')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, c.width, c.height)

  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace

  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const env = pmrem.fromEquirectangular(tex).texture
  pmrem.dispose()
  tex.dispose()

  // A large inward-facing sphere gives the visible backdrop.
  const skyGeo = new THREE.SphereGeometry(600, 32, 24)
  const skyCanvas = document.createElement('canvas')
  skyCanvas.width = 8
  skyCanvas.height = 512
  const sctx = skyCanvas.getContext('2d')
  // Row 0 of the canvas lands at the zenith, row 1 at the nadir, so the golden band
  // is centred on 0.5 to sit exactly on the horizon.
  const sg = sctx.createLinearGradient(0, 0, 0, 512)
  sg.addColorStop(0.0, '#04060f')
  sg.addColorStop(0.32, '#0a1030')
  sg.addColorStop(0.45, '#2e2a58')
  sg.addColorStop(0.49, '#7d4a3a')
  sg.addColorStop(0.52, '#e0924c')
  sg.addColorStop(0.56, '#4e2c26')
  sg.addColorStop(0.66, '#0c0a16')
  sg.addColorStop(1.0, '#05050a')
  sctx.fillStyle = sg
  sctx.fillRect(0, 0, 8, 512)
  const skyTex = new THREE.CanvasTexture(skyCanvas)
  skyTex.colorSpace = THREE.SRGBColorSpace
  const sky = new THREE.Mesh(
    skyGeo,
    // fog:false keeps the golden-hour horizon readable; scene fog is for the city only
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false })
  )
  sky.name = 'sky'

  return { env, sky }
}

/* --------------------------------------------------------------- labels ---- */

const labelCache = new Map()

/** A 3D text label drawn on a dark rounded chip with a coloured border. */
export function makeLabel(text, color = CY, { scale = 1, sub = '' } = {}) {
  const key = `${text}|${color}|${sub}`
  let tex = labelCache.get(key)
  if (!tex) {
    const pad = 26
    const fs = 46
    const subFs = 28
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`
    const w = ctx.measureText(text).width
    let subW = 0
    if (sub) {
      ctx.font = `500 ${subFs}px "JetBrains Mono", monospace`
      subW = ctx.measureText(sub).width
    }
    c.width = Math.ceil(Math.max(w, subW) + pad * 2)
    c.height = Math.ceil(fs + (sub ? subFs + 10 : 0) + pad * 1.4)

    const r = 22
    const cw = c.width
    const ch = c.height
    ctx.clearRect(0, 0, cw, ch)
    ctx.beginPath()
    ctx.moveTo(r, 2)
    ctx.arcTo(cw - 2, 2, cw - 2, ch - 2, r)
    ctx.arcTo(cw - 2, ch - 2, 2, ch - 2, r)
    ctx.arcTo(2, ch - 2, 2, 2, r)
    ctx.arcTo(2, 2, cw - 2, 2, r)
    ctx.closePath()
    ctx.fillStyle = 'rgba(8,9,14,0.92)'
    ctx.fill()
    ctx.lineWidth = 3.5
    ctx.strokeStyle = color
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#F4F4F9'
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`
    ctx.fillText(text, cw / 2, sub ? ch / 2 - subFs * 0.55 : ch / 2)
    if (sub) {
      ctx.fillStyle = color
      ctx.font = `500 ${subFs}px "JetBrains Mono", monospace`
      ctx.fillText(sub, cw / 2, ch / 2 + fs * 0.55)
    }

    tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    labelCache.set(key, tex)
  }

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
  )
  const h = 3.4 * scale
  sprite.scale.set((tex.image.width / tex.image.height) * h, h, 1)
  sprite.renderOrder = 20
  return sprite
}

/* -------------------------------------------------------------- helpers ---- */

const glassMat = (color, { emissive = 0.5, rough = 0.25, metal = 0.6, opacity = 1 } = {}) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: emissive,
    roughness: rough,
    metalness: metal,
    transparent: opacity < 1,
    opacity,
  })

const concrete = (color = '#20222c', rough = 0.85) =>
  new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: 0.15 })

function markPickable(obj, node, out) {
  obj.traverse((m) => {
    if (m.isMesh) {
      m.userData.node = node
      out.push(m)
    }
  })
}

/* ---------------------------------------------------------------- ground --- */

function buildGround() {
  const g = new THREE.Group()

  const plate = new THREE.Mesh(
    new THREE.CircleGeometry(160, 96),
    new THREE.MeshStandardMaterial({ color: '#0b0d16', roughness: 0.95, metalness: 0.05 })
  )
  plate.rotation.x = -Math.PI / 2
  plate.receiveShadow = true
  g.add(plate)

  // A wide dark apron hides the below-horizon half of the sky dome and gives the
  // fog something to fade into, so the horizon reads as a thin warm band.
  const apron = new THREE.Mesh(
    new THREE.RingGeometry(158, 520, 96, 1),
    new THREE.MeshBasicMaterial({ color: '#070810', fog: true })
  )
  apron.rotation.x = -Math.PI / 2
  apron.position.y = -0.1
  g.add(apron)

  // faint concentric rings + radial spokes, drawn as line geometry
  const ringMat = new THREE.LineBasicMaterial({ color: CY, transparent: true, opacity: 0.12 })
  for (let r = 20; r <= 140; r += 20) {
    const pts = []
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.06, Math.sin(a) * r))
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat))
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const pts = [
      new THREE.Vector3(Math.cos(a) * 12, 0.06, Math.sin(a) * 12),
      new THREE.Vector3(Math.cos(a) * 145, 0.06, Math.sin(a) * 145),
    ]
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat))
  }

  return g
}

/* -------------------------------------------------------------- landmark --- */

function buildLandmark(pickable) {
  const g = new THREE.Group()
  const core = { id: 'core', name: 'Inspironics Core' }

  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 3, 48), concrete('#1a1d28'))
  base.position.y = 1.5
  base.castShadow = base.receiveShadow = true
  g.add(base)

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 6.2, 24, 40, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#101425',
      roughness: 0.2,
      metalness: 0.9,
      side: THREE.DoubleSide,
    })
  )
  shaft.position.y = 15
  shaft.castShadow = true
  g.add(shaft)

  // vertical light ribs
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.3, 23, 0.3), glassMat(CY, { emissive: 2.2, metal: 0.2 }))
    rib.position.set(Math.cos(a) * 5.4, 15, Math.sin(a) * 5.4)
    g.add(rib)
  }

  markPickable(g, core, pickable)

  // stack layers — each is its own pickable ring with a label
  const rings = []
  STACK_LAYERS.forEach((layer, i) => {
    const y = 26 + i * 8
    const ring = new THREE.Group()
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(7.5 - i * 0.7, 7.5 - i * 0.7, 1.6, 48),
      glassMat(layer.color, { emissive: 0.55, rough: 0.15, metal: 0.85 })
    )
    disc.castShadow = true
    ring.add(disc)
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(9 - i * 0.7, 0.22, 12, 72),
      glassMat(layer.color, { emissive: 3, metal: 0.1 })
    )
    halo.rotation.x = Math.PI / 2
    ring.add(halo)
    ring.position.y = y
    markPickable(ring, layer, pickable)

    const label = makeLabel(layer.name, layer.color, { scale: 0.72 })
    label.position.set(11.5, y + 1.2, 0)
    g.add(label)

    rings.push({ ring, halo, i })
    g.add(ring)
  })

  // crown beacon
  const crown = new THREE.Mesh(new THREE.OctahedronGeometry(3.4, 0), glassMat(CY, { emissive: 3.4, metal: 0.2 }))
  crown.position.y = 26 + STACK_LAYERS.length * 8 + 2
  markPickable(crown, { id: 'core', name: 'Inspironics Core' }, pickable)
  g.add(crown)

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 2.6, 40, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: CY, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  )
  beam.position.y = crown.position.y + 20
  g.add(beam)

  const coreLabel = makeLabel('Inspironics Core', CY, { scale: 1.05, sub: 'INTELLIGENCE BACKBONE' })
  coreLabel.position.set(0, crown.position.y + 8, 0)
  g.add(coreLabel)

  return { group: g, update: (t) => {
    crown.rotation.y = t * 0.5
    crown.rotation.x = Math.sin(t * 0.4) * 0.25
    rings.forEach(({ ring, halo, i }) => {
      ring.rotation.y = t * (0.18 + i * 0.05) * (i % 2 ? -1 : 1)
      halo.material.emissiveIntensity = 2.2 + Math.sin(t * 1.5 + i) * 0.9
    })
  } }
}

/* ------------------------------------------------------------ zone kinds --- */

function boxTower(w, h, d, color, emissive = 0.25) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat(color, { emissive, rough: 0.35, metal: 0.65 }))
  m.position.y = h / 2
  m.castShadow = m.receiveShadow = true
  return m
}

function windTurbine(color) {
  const g = new THREE.Group()
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 14, 12), concrete('#c9cdd8', 0.6))
  mast.position.y = 7
  mast.castShadow = true
  g.add(mast)
  const hub = new THREE.Group()
  hub.position.y = 14
  const nac = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.9), concrete('#e2e6ef', 0.5))
  hub.add(nac)
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 7.5, 0.6), glassMat(color, { emissive: 0.5, metal: 0.3 }))
    blade.position.y = 3.7
    const arm = new THREE.Group()
    arm.rotation.z = (i / 3) * Math.PI * 2
    arm.add(blade)
    hub.add(arm)
  }
  g.add(hub)
  return { group: g, spin: (t) => (hub.rotation.z = t * 1.6) }
}

function solarArray(color) {
  const g = new THREE.Group()
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 0.2, 2.6),
        glassMat(color, { emissive: 0.35, rough: 0.1, metal: 0.9 })
      )
      p.rotation.x = -0.42
      p.position.set(c * 5.4 - 8, 1.5, r * 4 - 4)
      p.castShadow = true
      g.add(p)
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.5, 8), concrete('#3a3f4d'))
      leg.position.set(c * 5.4 - 8, 0.75, r * 4 - 4)
      g.add(leg)
    }
  }
  return g
}

function greenPatch(radius, color = '#2f7d52') {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 40),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 1, metalness: 0 })
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.12
  m.receiveShadow = true
  return m
}

function buildZoneCluster(zone) {
  const g = new THREE.Group()
  const spinners = []
  const c = zone.color

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 15, 0.7, 56),
    new THREE.MeshStandardMaterial({ color: '#13161f', roughness: 0.8, metalness: 0.25 })
  )
  pad.position.y = 0.35
  pad.receiveShadow = true
  g.add(pad)

  const rim = new THREE.Mesh(new THREE.TorusGeometry(15, 0.28, 10, 80), glassMat(c, { emissive: 2.6, metal: 0.1 }))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.75
  g.add(rim)

  switch (zone.kind3d) {
    case 'solar': {
      const arr = solarArray(c)
      arr.position.set(-1, 0.7, 2)
      g.add(arr)
      const t1 = windTurbine(c)
      t1.group.position.set(8, 0.7, -7)
      g.add(t1.group)
      spinners.push(t1.spin)
      const t2 = windTurbine(c)
      t2.group.position.set(-8, 0.7, -8)
      t2.group.scale.setScalar(0.8)
      g.add(t2.group)
      spinners.push(t2.spin)
      break
    }
    case 'field': {
      const patch = greenPatch(13.5, '#2b6b45')
      patch.position.y = 0.75
      g.add(patch)
      for (let i = 0; i < 6; i++) {
        const row = new THREE.Mesh(
          new THREE.BoxGeometry(22, 0.35, 1.1),
          new THREE.MeshStandardMaterial({ color: '#4fae72', roughness: 0.95 })
        )
        row.position.set(0, 0.95, i * 3.4 - 8.5)
        row.scale.x = Math.cos(((i * 3.4 - 8.5) / 15) * 1.1)
        g.add(row)
      }
      const t = windTurbine(c)
      t.group.position.set(9, 0.7, 9)
      t.group.scale.setScalar(0.7)
      g.add(t.group)
      spinners.push(t.spin)
      break
    }
    case 'homes': {
      const spots = [
        [-7, -6],
        [0, -7],
        [7, -5],
        [-8, 2],
        [0, 1],
        [8, 3],
        [-5, 8],
        [4, 9],
      ]
      spots.forEach(([x, z], i) => {
        const h = 3 + (i % 3)
        const body = boxTower(4.2, h, 4.2, i % 2 ? '#233047' : '#1d2739', 0.12)
        body.position.set(x, h / 2 + 0.7, z)
        g.add(body)
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.2, 4), concrete('#2c3852'))
        roof.rotation.y = Math.PI / 4
        roof.position.set(x, h + 1.8, z)
        roof.castShadow = true
        g.add(roof)
        const win = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.5, 4.35), glassMat(c, { emissive: 2.2, metal: 0.1 }))
        win.position.set(x, h * 0.55 + 0.7, z)
        g.add(win)
      })
      const lawn = greenPatch(4, '#2b6b45')
      lawn.position.y = 0.78 // clear of the 0.7-high zone pad, or it renders inside it
      g.add(lawn)
      break
    }
    case 'towers': {
      const spots = [
        [-8, -6, 16],
        [-2, -8, 22],
        [5, -5, 13],
        [9, 2, 18],
        [-9, 4, 11],
        [1, 6, 26],
        [-4, 9, 9],
        [7, 9, 14],
      ]
      spots.forEach(([x, z, h], i) => {
        const t = boxTower(4, h, 4, i % 3 === 0 ? '#16233a' : '#111a2c', 0.1)
        t.position.set(x, h / 2 + 0.7, z)
        g.add(t)
        for (let k = 1; k * 4 < h; k++) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.32, 4.1), glassMat(c, { emissive: 2.4, metal: 0.1 }))
          band.position.set(x, k * 4 + 0.7, z)
          g.add(band)
        }
      })
      break
    }
    case 'resort': {
      const main = boxTower(16, 7, 7, '#2a2231', 0.12)
      main.position.set(0, 4.2, -3)
      g.add(main)
      for (let k = 1; k < 4; k++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.3, 7.2), glassMat(c, { emissive: 2.2, metal: 0.1 }))
        band.position.set(0, k * 1.9 + 1, -3)
        g.add(band)
      }
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(5, 40),
        glassMat('#2ec9ff', { emissive: 0.7, rough: 0.05, metal: 0.9, opacity: 0.85 })
      )
      pool.rotation.x = -Math.PI / 2
      pool.position.set(0, 0.8, 7)
      g.add(pool)
      for (const x of [-8, 8]) {
        const palm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 5, 8), concrete('#5d4a34'))
        palm.position.set(x, 3.2, 7)
        g.add(palm)
        const top = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8), new THREE.MeshStandardMaterial({ color: '#38a163', roughness: 1 }))
        top.position.set(x, 5.9, 7)
        top.scale.y = 0.55
        g.add(top)
      }
      break
    }
    case 'campus': {
      const wings = [
        [0, -4, 12, 6, 8],
        [-8, 5, 7, 4.5, 7],
        [8, 5, 7, 4.5, 7],
      ]
      wings.forEach(([x, z, w, h, d]) => {
        const b = boxTower(w, h, d, '#1e2430', 0.1)
        b.position.set(x, h / 2 + 0.7, z)
        g.add(b)
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.35, d + 0.1), glassMat(c, { emissive: 2.2, metal: 0.1 }))
        band.position.set(x, h * 0.6 + 0.7, z)
        g.add(band)
      })
      const cross = new THREE.Group()
      const a = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.5), glassMat(c, { emissive: 3, metal: 0.1 }))
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.4, 0.5), glassMat(c, { emissive: 3, metal: 0.1 }))
      cross.add(a, b2)
      cross.position.set(0, 9.5, -0.2)
      g.add(cross)
      break
    }
    case 'plant': {
      const hall = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 20, 24, 1, false, 0, Math.PI), concrete('#2a2e3c', 0.7))
      hall.rotation.z = Math.PI / 2
      hall.rotation.y = Math.PI / 2
      hall.position.set(0, 0.8, 0)
      hall.castShadow = true
      g.add(hall)
      for (const x of [-6, 6]) {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 12, 16), concrete('#3a3f4f', 0.7))
        stack.position.set(x, 6.8, -9)
        stack.castShadow = true
        g.add(stack)
        const cap = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.22, 8, 24), glassMat(c, { emissive: 2.6, metal: 0.1 }))
        cap.rotation.x = Math.PI / 2
        cap.position.set(x, 12.9, -9)
        g.add(cap)
      }
      break
    }
    case 'datacenter':
    default: {
      for (let r = 0; r < 3; r++) {
        for (let cI = 0; cI < 3; cI++) {
          const h = 5 + ((r + cI) % 3)
          const hall = boxTower(6, h, 3.4, '#141a28', 0.08)
          hall.position.set(cI * 8 - 8, h / 2 + 0.7, r * 6 - 6)
          g.add(hall)
          const led = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.28, 3.5), glassMat(c, { emissive: 2.8, metal: 0.1 }))
          led.position.set(cI * 8 - 8, h - 1 + 0.7, r * 6 - 6)
          g.add(led)
        }
      }
      break
    }
  }

  return { group: g, spinners }
}

/* ----------------------------------------------------------- product node -- */

function buildProductNode(p) {
  const g = new THREE.Group()

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.4, 2.2, 32), concrete('#171a24', 0.7))
  pedestal.position.y = 1.1
  pedestal.castShadow = pedestal.receiveShadow = true
  g.add(pedestal)

  const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 0), glassMat(p.color, { emissive: 1.9, rough: 0.08, metal: 0.85 }))
  gem.position.y = 6.2
  gem.castShadow = true
  g.add(gem)

  const cage = new THREE.Mesh(
    new THREE.IcosahedronGeometry(4.4, 0),
    new THREE.MeshBasicMaterial({ color: p.color, wireframe: true, transparent: true, opacity: 0.4 })
  )
  cage.position.y = 6.2
  g.add(cage)

  const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.16, 10, 64), glassMat(p.color, { emissive: 3, metal: 0.1 }))
  ring.rotation.x = Math.PI / 2
  ring.position.y = 2.6
  g.add(ring)

  const light = new THREE.PointLight(p.color, 26, 42, 2)
  light.position.y = 6.5
  g.add(light)

  return {
    group: g,
    update: (t) => {
      gem.rotation.y = t * 0.7
      gem.rotation.x = t * 0.31
      cage.rotation.y = -t * 0.4
      gem.position.y = 6.2 + Math.sin(t * 1.2) * 0.35
      cage.position.y = gem.position.y
      light.intensity = 20 + Math.sin(t * 2.1) * 8
    },
  }
}

/* ---------------------------------------------------------- conduits ------- */

function buildConduits() {
  const g = new THREE.Group()
  const flows = []

  CONDUITS.forEach((c, idx) => {
    const from = new THREE.Vector3(...c.from)
    const to = new THREE.Vector3(...c.to)
    const mid = from.clone().lerp(to, 0.5)
    mid.y += 6 + from.distanceTo(to) * 0.09
    const curve = new THREE.QuadraticBezierCurve3(from.clone().setY(2.4), mid, to.clone().setY(2.4))

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.16, 8, false),
      new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.28 })
    )
    g.add(tube)

    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: c.color }))
    g.add(pulse)
    flows.push({ curve, pulse, offset: (idx * 0.137) % 1, speed: 0.09 + (idx % 5) * 0.012 })
  })

  return {
    group: g,
    update: (t) => {
      flows.forEach((f) => {
        const u = (f.offset + t * f.speed) % 1
        f.pulse.position.copy(f.curve.getPoint(u))
        f.pulse.scale.setScalar(0.7 + Math.sin(u * Math.PI) * 0.9)
      })
    },
  }
}

/* ------------------------------------------------------------- drones ------ */

function buildDrones(count = 9) {
  const g = new THREE.Group()
  const drones = []
  for (let i = 0; i < count; i++) {
    const d = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 1.5), concrete('#2b3040', 0.5))
    d.add(body)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? EM : CY }))
    led.position.y = -0.35
    d.add(led)
    const rotors = []
    for (const [x, z] of [
      [0.9, 0.9],
      [-0.9, 0.9],
      [0.9, -0.9],
      [-0.9, -0.9],
    ]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), concrete('#4a5064', 0.5))
      arm.position.set(x, 0.25, z)
      d.add(arm)
      const rotor = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.05, 0.16),
        new THREE.MeshBasicMaterial({ color: '#cfd6e6', transparent: true, opacity: 0.65 })
      )
      rotor.position.set(x, 0.5, z)
      d.add(rotor)
      rotors.push(rotor)
    }
    g.add(d)
    drones.push({
      d,
      rotors,
      r: 34 + (i % 4) * 22,
      y: 22 + (i % 5) * 7,
      speed: 0.08 + (i % 3) * 0.035,
      phase: (i / count) * Math.PI * 2,
      dir: i % 2 ? 1 : -1,
    })
  }
  return {
    group: g,
    update: (t) => {
      drones.forEach((o) => {
        const a = o.phase + t * o.speed * o.dir
        o.d.position.set(Math.cos(a) * o.r, o.y + Math.sin(t * 0.7 + o.phase) * 2.2, Math.sin(a) * o.r)
        o.d.rotation.y = -a + (o.dir > 0 ? -Math.PI / 2 : Math.PI / 2)
        o.rotors.forEach((r, k) => (r.rotation.y = t * 40 * (k % 2 ? 1 : -1)))
      })
    },
  }
}

/* -------------------------------------------------------------- city ------- */

/**
 * Assembles the whole city.
 * @returns {{ root: THREE.Group, pickable: THREE.Mesh[], update: (t:number)=>void, dispose: ()=>void }}
 */
export function buildCity() {
  const root = new THREE.Group()
  const pickable = []
  const updaters = []

  root.add(buildGround())

  // scattered green patches between the zones
  const patches = [
    [-30, 8, 9],
    [34, -8, 7],
    [8, 26, 6],
    [-4, -34, 8],
    [40, 34, 6.5],
    [-44, -6, 7],
  ]
  patches.forEach(([x, z, r]) => {
    const p = greenPatch(r)
    p.position.set(x, 0.12, z)
    root.add(p)
  })

  const landmark = buildLandmark(pickable)
  root.add(landmark.group)
  updaters.push(landmark.update)

  ZONES.forEach((zone) => {
    const { group, spinners } = buildZoneCluster(zone)
    group.position.set(zone.pos[0], 0, zone.pos[2])
    markPickable(group, zone, pickable)
    root.add(group)
    if (spinners.length) updaters.push((t) => spinners.forEach((s) => s(t)))

    const label = makeLabel(zone.name, zone.color, { scale: 0.95 })
    label.position.set(zone.pos[0], 20, zone.pos[2])
    root.add(label)
  })

  PRODUCT_NODES.forEach((p) => {
    const node = buildProductNode(p)
    node.group.position.set(p.pos[0], 0, p.pos[2])
    markPickable(node.group, p, pickable)
    root.add(node.group)
    updaters.push(node.update)

    const label = makeLabel(p.name, p.color, { scale: 0.8, sub: 'PRODUCT' })
    label.position.set(p.pos[0], 13.5, p.pos[2])
    root.add(label)
  })

  const conduits = buildConduits()
  root.add(conduits.group)
  updaters.push(conduits.update)

  const drones = buildDrones()
  root.add(drones.group)
  updaters.push(drones.update)

  const dispose = () => {
    root.traverse((o) => {
      // Sprites share one module-level geometry and their maps live in
      // labelCache, so only the per-sprite material is ours to free.
      if (o.isSprite) {
        o.material?.dispose?.()
        return
      }
      if (o.isMesh || o.isLine) {
        o.geometry?.dispose?.()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m) => {
          m?.map?.dispose?.()
          m?.dispose?.()
        })
      }
    })
  }

  return { root, pickable, update: (t) => updaters.forEach((u) => u(t)), dispose }
}

/** Hemisphere + directional sun rig with soft shadows. */
export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight('#b9d2ff', '#1a1410', 0.85)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight('#ffd0a0', 2.5)
  sun.position.set(-90, 78, 62)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 320
  sun.shadow.camera.left = -140
  sun.shadow.camera.right = 140
  sun.shadow.camera.top = 140
  sun.shadow.camera.bottom = -140
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.035
  scene.add(sun)

  const rim = new THREE.DirectionalLight(CY, 0.55)
  rim.position.set(70, 40, -80)
  scene.add(rim)

  return { hemi, sun, rim }
}
