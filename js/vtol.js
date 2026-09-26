// =====================================================================
// VAJRON VTOL: procedural airframe model
// Hybrid quadplane: high straight wing with upturned tips, rounded
// fuselage pod, twin booms carrying four vertical-lift rotors, an
// inverted-U tail joining the booms, and a separate pusher for cruise.
// Units are metres. Axes: +X forward (nose), +Y up, +Z right wing.
// Wingspan is 2.0 m, matching the "2-metre class" in the product brief.
// =====================================================================

export const LAYOUT = {
  span: 2.0,
  boomZ: 0.36,
  boomY: 0.081,
  rotorX: [0.43, -0.41],       // front / rear lift rotors on each boom
  rotorR: 0.19,
  pusherX: -0.462,
  gimbal: [0.33, -0.13, 0],
  wingLE: 0.14, wingY: 0.098,
};

export function buildVTOL(THREE, opt = {}) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const root = new THREE.Group();
  root.name = 'VAJRON-VTOL';
  const M = makeMaterials(THREE, opt);
  const parts = {};

  // ------------------------------------------------------------------
  // geometry helpers
  // ------------------------------------------------------------------
  // NACA 4-digit section, closed trailing edge. Returns [x, y, isUpper]
  // from the trailing edge over the upper surface to the leading edge
  // and back along the lower surface.
  function naca(m, p, t, n = 36) {
    const xs = [];
    for (let i = 0; i <= n; i++) xs.push((1 - Math.cos(Math.PI * i / n)) / 2);
    const surf = (x, up) => {
      const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
      let yc = 0, dyc = 0;
      if (m > 0) {
        if (x < p) { yc = m / (p * p) * (2 * p * x - x * x); dyc = 2 * m / (p * p) * (p - x); }
        else { yc = m / ((1 - p) ** 2) * ((1 - 2 * p) + 2 * p * x - x * x); dyc = 2 * m / ((1 - p) ** 2) * (p - x); }
      }
      const th = Math.atan(dyc);
      return up ? [x - yt * Math.sin(th), yc + yt * Math.cos(th), x, 1]
                : [x + yt * Math.sin(th), yc - yt * Math.cos(th), x, 0];
    };
    const pts = [];
    for (let i = n; i >= 0; i--) pts.push(surf(xs[i], true));
    for (let i = 1; i < n; i++) pts.push(surf(xs[i], false));
    return pts;
  }

  // Loft a profile through sections. Each section: o (leading-edge point),
  // c (unit chord direction, LE to TE), t (unit thickness direction), len.
  // UVs: u = spanwise 0..1, v = 0.5 + 0.5*x on the upper surface and
  // 0.5 - 0.5*x on the lower surface, so chordwise panel lines are easy
  // to draw into a texture.
  function loft(sections, profile, { capStart = true, capEnd = true } = {}) {
    const P = profile.length, S = sections.length;
    const pos = [], uv = [], idx = [];
    sections.forEach((sec, s) => {
      const u = S > 1 ? s / (S - 1) : 0;
      for (const [x, y, xc, up] of profile) {
        const p = sec.o.clone().addScaledVector(sec.c, x * sec.len).addScaledVector(sec.t, y * sec.len);
        pos.push(p.x, p.y, p.z);
        uv.push(u, up ? 0.5 + 0.5 * xc : 0.5 - 0.5 * xc);
      }
    });
    for (let s = 0; s < S - 1; s++) for (let i = 0; i < P; i++) {
      const a = s * P + i, b = s * P + (i + 1) % P, c = (s + 1) * P + i, d = (s + 1) * P + (i + 1) % P;
      idx.push(a, c, b, b, c, d);
    }
    const cap = (s, flip) => {
      const base = pos.length / 3;
      const cen = V(0, 0, 0);
      for (let i = 0; i < P; i++) cen.add(V(pos[(s * P + i) * 3], pos[(s * P + i) * 3 + 1], pos[(s * P + i) * 3 + 2]));
      cen.multiplyScalar(1 / P);
      pos.push(cen.x, cen.y, cen.z); uv.push(0, 0.5);
      for (let i = 0; i < P; i++) {
        const a = s * P + i, b = s * P + (i + 1) % P;
        if (flip) idx.push(base, a, b); else idx.push(base, b, a);
      }
    };
    if (capStart) cap(0, true);
    if (capEnd) cap(S - 1, false);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return orient(g);
  }

  // Make sure triangles face outward: compare normals with the direction
  // from the geometry's centre line; flip the winding if most face inward.
  function orient(g) {
    g.computeBoundingBox();
    const bb = g.boundingBox, c = bb.getCenter(V(0, 0, 0));
    const p = g.attributes.position, n = g.attributes.normal;
    let score = 0;
    for (let i = 0; i < p.count; i += 7) {
      const d = V(p.getX(i) - c.x, p.getY(i) - c.y, p.getZ(i) - c.z);
      score += Math.sign(d.dot(V(n.getX(i), n.getY(i), n.getZ(i))));
    }
    if (score < 0) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      g.index.needsUpdate = true;
      g.computeVertexNormals();
    }
    return g;
  }

  function mirrorZ(geo) {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1));
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  const mesh = (geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (name) m.name = name;
    return m;
  };

  // Canvas texture for panel lines and markings on a lofted surface.
  function panelTexture(draw, w = 2048, h = 1024) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }
  const LINE = '#c3c8cf';

  // ------------------------------------------------------------------
  // fuselage: superelliptic pod, blunt rounded nose, tapering tail
  // ------------------------------------------------------------------
  const XN = 0.60, XT = -0.42, W = 0.088, H = 0.092, NEXP = 2.6, XNOSE = 0.30, XTAIL = 0.0;
  const halfW = (x) => {
    if (x > XNOSE) return W * Math.sqrt(Math.max(0, 1 - ((x - XNOSE) / (XN - XNOSE)) ** 2));
    if (x > XTAIL) return W;
    const u = (XTAIL - x) / (XTAIL - XT);
    return 0.032 + (W - 0.032) * 0.5 * (1 + Math.cos(Math.PI * u));
  };
  const halfH = (x) => {
    if (x > XNOSE) return H * Math.sqrt(Math.max(0, 1 - ((x - XNOSE) / (XN - XNOSE)) ** 2));
    if (x > XTAIL) return H;
    const u = (XTAIL - x) / (XTAIL - XT);
    return 0.032 + (H - 0.032) * 0.5 * (1 + Math.cos(Math.PI * u));
  };
  const yc = (x) => {
    if (x > XNOSE) return -0.016 * ((x - XNOSE) / (XN - XNOSE)) ** 2;
    if (x > XTAIL) return 0;
    const u = (XTAIL - x) / (XTAIL - XT);
    return 0.026 * (1 - Math.cos(Math.PI * u)) / 2;
  };
  // point on the fuselage surface at station x, angle t (0 = right side)
  const fusPoint = (x, t, off = 0) => {
    const ct = Math.cos(t), st = Math.sin(t);
    const w = halfW(x) + off, h = halfH(x) + off;
    return V(x, yc(x) + h * Math.sign(st) * Math.abs(st) ** (2 / NEXP), w * Math.sign(ct) * Math.abs(ct) ** (2 / NEXP));
  };
  parts.fusPoint = fusPoint;

  {
    const NS = 150, NT = 96, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NS; i++) {
      const s = i / NS, e = s * s * (3 - 2 * s) * 0.55 + s * 0.45;   // denser at nose and tail
      const x = XN - (XN - XT) * e;
      for (let j = 0; j <= NT; j++) {
        const a = j / NT, t = -Math.PI / 2 + a * Math.PI * 2;
        const p = fusPoint(x, t);
        pos.push(p.x, p.y, p.z);
        uv.push((XN - x) / (XN - XT), a);
      }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
      const a = i * (NT + 1) + j, b = a + NT + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    // close the tail
    const last = NS * (NT + 1), cen = pos.length / 3;
    pos.push(XT, yc(XT), 0); uv.push(1, 0.5);
    for (let j = 0; j < NT; j++) idx.push(cen, last + j + 1, last + j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    orient(g);

    // markings: u along the length (nose 0 -> tail 1), v around from the
    // bottom (0.25 right side, 0.5 top, 0.75 left side). With flipY the
    // canvas row is (1 - v) * h.
    const tex = panelTexture((c, w, h) => {
      const X = (x) => (XN - x) / (XN - XT) * w;
      const R = (v) => (1 - v) * h;
      c.strokeStyle = LINE; c.lineWidth = 3;
      // nose cap seam and tail cone seam
      [0.54, -0.29].forEach((x) => { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), h); c.stroke(); });
      // top access hatch ahead of the wing
      c.beginPath(); c.roundRect(X(0.50), R(0.585), X(0.215) - X(0.50), R(0.415) - R(0.585), 14); c.stroke();
      // battery bay hatch underneath
      c.beginPath(); c.roundRect(X(0.24), R(0.09), X(-0.14) - X(0.24), R(-0.0) - R(0.09) + 1, 10); c.stroke();
      c.beginPath(); c.roundRect(X(0.24), R(1.0), X(-0.14) - X(0.24), R(0.91) - R(1.0), 10); c.stroke();
      // wordmark, logo blue, on both flanks. The texture is anisotropic:
      // ~2420 px/m along the body vs ~1990 px/m around it at 2048x1024,
      // so letters are stretched x1.22 along the body to read true.
      const word = (vCentre, mirrorX, flipY) => {
        c.save();
        c.translate(X(0.335), R(vCentre));
        c.scale(mirrorX ? -1 : 1, flipY ? -1 : 1);
        c.scale(1.22, 1);
        c.fillStyle = '#12386E';
        c.font = '800 54px Manrope, "Helvetica Neue", Arial, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('VAJRON', 0, 0);
        c.restore();
      };
      word(0.285, true, false);    // right flank (+Z): mirrored along the body
      word(0.715, false, true);    // left flank (-Z): flipped vertically
    }, 2048, 1024);
    const mat = M.white.clone();
    mat.map = tex;
    const fus = mesh(g, mat, 'fuselage');
    root.add(fus);
    parts.fuselage = fus;
  }

  // ------------------------------------------------------------------
  // wing: NACA 2412, 2.0 m span, slight taper, upturned tips
  // ------------------------------------------------------------------
  {
    const prof = naca(0.02, 0.4, 0.12, 36);
    const secs = [];
    const c = V(-1, 0, 0);
    const dih = Math.tan(1 * Math.PI / 180);
    const flat = 0.925, N1 = 26;
    for (let i = 0; i <= N1; i++) {
      const z = flat * i / N1, k = z / flat;
      const len = 0.25 - 0.07 * k;
      const s = V(0, 0, 1);
      secs.push({ o: V(LAYOUT.wingLE - 0.015 * k, LAYOUT.wingY + z * dih, z), c, t: c.clone().cross(s).normalize(), len });
    }
    // winglet: bend up through ~75 degrees on a 60 mm radius, then extend
    const y0 = LAYOUT.wingY + flat * dih, R = 0.06, N2 = 12, phiMax = Math.PI / 2 * 0.83;
    for (let i = 1; i <= N2; i++) {
      const phi = phiMax * i / N2, k = i / N2;
      const s = V(0, Math.sin(phi), Math.cos(phi));
      secs.push({ o: V(LAYOUT.wingLE - 0.015 - 0.02 * k, y0 + R * (1 - Math.cos(phi)), flat + R * Math.sin(phi)), c, t: c.clone().cross(s).normalize(), len: 0.18 - 0.035 * k });
    }
    const last = secs[secs.length - 1], sEnd = V(0, Math.sin(phiMax), Math.cos(phiMax));
    for (let i = 1; i <= 2; i++) {
      secs.push({ o: last.o.clone().addScaledVector(sEnd, 0.018 * i).add(V(-0.01 * i, 0, 0)), c, t: last.t.clone(), len: last.len - 0.012 * i });
    }
    const g = loft(secs, prof, { capStart: false, capEnd: true });
    const tex = panelTexture((cx, w, h) => {
      // aileron hinge line at 72% chord, outer part of the span, upper and lower
      cx.strokeStyle = LINE; cx.lineWidth = 3;
      const U = (z) => z / (flat + 0.12) * (N1 / (secs.length - 1)) * (flat + 0.12) / flat * w;
      const u0 = U(0.52), u1 = U(0.88);
      [0.5 + 0.5 * 0.72, 0.5 - 0.5 * 0.72].forEach((v) => {
        const row = (1 - v) * h;
        cx.beginPath(); cx.moveTo(u0, row); cx.lineTo(u1, row); cx.stroke();
      });
      // aileron ends (chordwise), upper and lower
      [u0, u1].forEach((u) => {
        [[1, 0.5 + 0.5 * 0.72], [0.5 - 0.5 * 0.72, 0]].forEach(([va, vb]) => {
          cx.beginPath(); cx.moveTo(u, (1 - va) * h); cx.lineTo(u, (1 - vb) * h); cx.stroke();
        });
      });
    }, 2048, 512);
    const mat = M.white.clone(); mat.map = tex;
    const right = mesh(g, mat, 'wing-right');
    const left = mesh(mirrorZ(g), mat, 'wing-left');
    root.add(right, left);
    parts.wing = [right, left];
  }

  // ------------------------------------------------------------------
  // booms with a short fairing into the wing
  // ------------------------------------------------------------------
  const boomR = 0.017, boomFront = 0.475, boomBack = -0.99;
  [-1, 1].forEach((side) => {
    const len = boomFront - boomBack - 2 * boomR;
    const g = new THREE.CapsuleGeometry(boomR, len, 10, 28);
    g.rotateZ(Math.PI / 2);
    const b = mesh(g, M.white, 'boom');
    b.position.set((boomFront + boomBack) / 2, LAYOUT.boomY, side * LAYOUT.boomZ);
    root.add(b);
  });

  // ------------------------------------------------------------------
  // lift rotors: motor mount, motor bell, two-blade prop, blur disc
  // ------------------------------------------------------------------
  function blade(radius, rootR, chordMax, twistRoot, twistTip) {
    const prof = naca(0.04, 0.4, 0.07, 14);
    const secs = [], N = 14;
    for (let i = 0; i <= N; i++) {
      const k = i / N, r = rootR + (radius - rootR) * k;
      const chord = chordMax * (0.72 + 0.9 * k - 1.35 * k * k) + 0.004;
      const tw = (twistRoot + (twistTip - twistRoot) * k) * Math.PI / 180;
      const cdir = V(0, -Math.sin(tw), Math.cos(tw));       // LE -> TE (LE leads towards -Z)
      const tdir = V(0, Math.cos(tw), Math.sin(tw));
      secs.push({ o: V(r, 0, -chord * 0.35 * Math.cos(tw)), c: cdir, t: tdir, len: chord });
    }
    return loft(secs, prof, { capStart: true, capEnd: true });
  }
  const bladeCCW = blade(LAYOUT.rotorR, 0.022, 0.034, 21, 8);
  const bladeCW = mirrorZ(bladeCCW);

  function prop(geo, radius, hubR = 0.011) {
    const grp = new THREE.Group();
    const b1 = mesh(geo, M.carbon); const b2 = mesh(geo, M.carbon); b2.rotation.y = Math.PI;
    const hub = mesh(new THREE.CylinderGeometry(hubR, hubR * 1.1, 0.012, 20), M.dark);
    const cap = mesh(new THREE.SphereGeometry(hubR * 0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.silver);
    cap.position.y = 0.006;
    grp.add(b1, b2, hub, cap);
    grp.userData.blades = [b1, b2];
    return grp;
  }

  function blurDisc(radius) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(128, 128, 8, 128, 128, 128);
    gr.addColorStop(0, 'rgba(120,124,130,0)');
    gr.addColorStop(0.1, 'rgba(120,124,130,.34)');
    gr.addColorStop(0.5, 'rgba(150,154,160,.16)');
    gr.addColorStop(0.9, 'rgba(175,179,186,.12)');
    gr.addColorStop(0.955, 'rgba(210,214,220,.30)');
    gr.addColorStop(1, 'rgba(210,214,220,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    // faint concentric streaks, the way a spinning prop reads on camera
    for (let i = 0; i < 9; i++) {
      c.strokeStyle = `rgba(230,232,236,${0.035 + (i % 3) * 0.02})`;
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(128, 128, 30 + i * 11, 0, Math.PI * 2); c.stroke();
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 64),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    return m;
  }

  const rotors = [];
  let n = 0;
  [-1, 1].forEach((side) => LAYOUT.rotorX.forEach((rx, k) => {
    const grp = new THREE.Group();
    grp.position.set(rx, LAYOUT.boomY, side * LAYOUT.boomZ);
    const base = mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.022, 28), M.dark);
    base.position.y = boomR + 0.011;
    const stator = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 32), M.dark);
    stator.position.y = boomR + 0.032;
    const ring = mesh(new THREE.CylinderGeometry(0.0255, 0.0255, 0.004, 32), M.silver);
    ring.position.y = boomR + 0.043;
    const cw = (side === 1) !== (k === 1);             // diagonal pairs counter-rotate
    const p = prop(cw ? bladeCW : bladeCCW, LAYOUT.rotorR);
    p.position.y = boomR + 0.052;
    const disc = blurDisc(LAYOUT.rotorR * 1.02);
    disc.position.y = boomR + 0.052;
    grp.add(base, stator, ring, p, disc);
    root.add(grp);
    rotors.push({ grp, prop: p, disc, dir: cw ? -1 : 1, angle: n * 0.7, speed: 0, park: 0 });
    n++;
  }));
  parts.rotors = rotors;

  // ------------------------------------------------------------------
  // pusher: nacelle, spinner and two-blade prop for forward cruise
  // ------------------------------------------------------------------
  const pusher = {};
  {
    const grp = new THREE.Group();
    const y = yc(XT);
    const nac = mesh(new THREE.CylinderGeometry(0.027, 0.03, 0.035, 32), M.dark);
    nac.rotation.z = Math.PI / 2; nac.position.set(XT - 0.012, y, 0);
    const pg = prop(blade(0.145, 0.018, 0.03, 26, 11), 0.145, 0.013);
    const holder = new THREE.Group();
    holder.position.set(LAYOUT.pusherX, y, 0);
    holder.rotation.z = -Math.PI / 2;                    // prop axis +Y -> +X (thrust forward)
    holder.add(pg);
    const spin = mesh(new THREE.ConeGeometry(0.018, 0.034, 28), M.white);
    spin.rotation.z = Math.PI / 2; spin.position.set(LAYOUT.pusherX - 0.017, y, 0);
    const disc = blurDisc(0.148);
    const dh = new THREE.Group(); dh.position.copy(holder.position); dh.rotation.z = -Math.PI / 2; dh.add(disc);
    grp.add(nac, holder, spin, dh);
    root.add(grp);
    Object.assign(pusher, { prop: pg, disc, angle: 0.4, speed: 0 });
    parts.pusher = pusher;
  }

  // ------------------------------------------------------------------
  // inverted-U tail: two fins on the boom ends joined by the tailplane
  // ------------------------------------------------------------------
  {
    const sym = naca(0, 0, 0.10, 28);
    const finTop = 0.31;
    const finSecs = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const k = i / N, y = LAYOUT.boomY + boomR * 0.6 + (finTop - LAYOUT.boomY - boomR * 0.6) * k;
      finSecs.push({ o: V(-0.775 - 0.07 * k, y, 0), c: V(-1, 0, 0), t: V(0, 0, -1), len: 0.205 - 0.055 * k });
    }
    const finG = loft(finSecs, sym, { capStart: true, capEnd: true });
    const tailTex = panelTexture((cx, w, h) => {
      cx.strokeStyle = LINE; cx.lineWidth = 3;
      [0.5 + 0.5 * 0.68, 0.5 - 0.5 * 0.68].forEach((v) => { const r = (1 - v) * h; cx.beginPath(); cx.moveTo(w * 0.18, r); cx.lineTo(w * 0.97, r); cx.stroke(); });
    }, 1024, 512);
    const finMat = M.white.clone(); finMat.map = tailTex;
    [-1, 1].forEach((side) => {
      const f = mesh(finG, finMat, 'fin');
      f.position.z = side * LAYOUT.boomZ;
      root.add(f);
    });
    const stabSecs = [];
    const Ns = 16, half = LAYOUT.boomZ + 0.006;
    for (let i = 0; i <= Ns; i++) {
      const z = -half + 2 * half * i / Ns;
      stabSecs.push({ o: V(-0.845, finTop, z), c: V(-1, 0, 0), t: V(0, 1, 0), len: 0.15 });
    }
    const stab = mesh(loft(stabSecs, sym, { capStart: true, capEnd: true }), finMat, 'tailplane');
    root.add(stab);
    parts.tail = stab;
  }

  // ------------------------------------------------------------------
  // tri-sensor gimbal under the nose (EO, thermal, laser rangefinder)
  // ------------------------------------------------------------------
  const gimbal = {};
  {
    const gx = LAYOUT.gimbal[0];
    const bottom = yc(gx) - halfH(gx);
    const gy = bottom - 0.036;
    const grp = new THREE.Group();
    const pylon = mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.018, 28), M.dark);
    pylon.position.set(gx, bottom - 0.006, 0);
    const pan = new THREE.Group(); pan.position.set(gx, bottom - 0.016, 0);
    const disk = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 36), M.graphite);
    disk.position.y = -0.004;
    const armG = new THREE.CapsuleGeometry(0.011, 0.03, 8, 20);
    const armL = mesh(armG, M.graphite); armL.scale.set(1.25, 1, 0.55); armL.position.set(0, -0.026, -0.047);
    const armR = mesh(armG, M.graphite); armR.scale.set(1.25, 1, 0.55); armR.position.set(0, -0.026, 0.047);
    const tilt = new THREE.Group(); tilt.position.y = gy - (bottom - 0.016);
    const ball = mesh(new THREE.SphereGeometry(0.041, 56, 36), M.graphite);
    const plate = mesh(new THREE.CylinderGeometry(0.031, 0.034, 0.012, 48), M.dark);
    plate.rotation.z = Math.PI / 2; plate.position.x = 0.034;
    tilt.add(ball, plate);
    // three apertures on the forward face of the ball
    const lens = (r, depth, mat, dy, dz) => {
      const g = new THREE.Group();
      const barrel = mesh(new THREE.CylinderGeometry(r * 1.28, r * 1.28, depth, 32), M.dark);
      barrel.rotation.z = Math.PI / 2;
      const rim = mesh(new THREE.TorusGeometry(r * 1.18, r * 0.1, 10, 40), M.dark);
      rim.rotation.y = Math.PI / 2; rim.position.x = depth / 2;
      const glass = mesh(new THREE.CircleGeometry(r, 40), mat);
      glass.rotation.y = Math.PI / 2; glass.position.x = depth / 2 - 0.0006;
      g.add(barrel, rim, glass);
      const dir = V(1, dy * 0.6, dz * 0.6).normalize();
      g.position.copy(dir.clone().multiplyScalar(0.034)).add(V(0.004, dy * 0.012, dz * 0.03));
      g.quaternion.setFromUnitVectors(V(1, 0, 0), dir);
      return g;
    };
    tilt.add(lens(0.0135, 0.02, M.glass, 0.12, -0.3));     // daylight (EO)
    tilt.add(lens(0.0105, 0.018, M.glassIR, 0.12, 0.32));  // thermal / infrared
    tilt.add(lens(0.0052, 0.014, M.glass, -0.36, -0.12));  // laser rangefinder, emitter
    tilt.add(lens(0.0052, 0.014, M.glass, -0.36, 0.12));   // laser rangefinder, receiver
    tilt.rotation.z = -0.28;
    pan.add(disk, armL, armR, tilt);
    grp.add(pylon, pan);
    root.add(grp);
    Object.assign(gimbal, { pan, tilt });
    parts.gimbal = gimbal;
  }

  // ------------------------------------------------------------------
  // obstacle sensing: one dark visor band wrapped around the nose that
  // carries the dual straight-beam LiDAR (centre) and the dual fixed
  // cameras (angled outward for forward/lateral awareness)
  // ------------------------------------------------------------------
  {
    const onNose = (y, z) => {
      // solve for the station x where (x, y, z) lies on the fuselage skin
      const f = (x) => {
        const w = halfW(x), h = halfH(x);
        if (w <= 1e-5 || h <= 1e-5) return 1;
        return Math.abs(z / w) ** NEXP + Math.abs((y - yc(x)) / h) ** NEXP - 1;
      };
      let a = XN - 0.16, b = XN;
      for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; }
      return (a + b) / 2;
    };
    const yb = yc(XN) + 0.004, half = 0.0075, zmax = 0.046, NR = 6, NC = 48;
    const pos = [], idx = [];
    const pt = (y, z) => {
      const x = onNose(y, z), e = 0.0006;
      // outward normal by finite differences of the implicit surface
      const g = (dx, dy, dz) => {
        const X = Math.min(x + dx, XN - 0.002), w = Math.max(halfW(X), 1e-4), h = Math.max(halfH(X), 1e-4);
        return Math.abs((z + dz) / w) ** NEXP + Math.abs((y + dy - yc(X)) / h) ** NEXP;
      };
      let n = V(g(e, 0, 0) - g(-e, 0, 0), g(0, e, 0) - g(0, -e, 0), g(0, 0, e) - g(0, 0, -e));
      if (!isFinite(n.x) || !isFinite(n.y) || !isFinite(n.z) || n.lengthSq() === 0) n = V(1, 0, 0);
      n.normalize();
      return V(x, y, z).addScaledVector(n, 0.0009);
    };
    for (let r = 0; r <= NR; r++) for (let c = 0; c <= NC; c++) {
      const y = yb - half + 2 * half * r / NR, z = -zmax + 2 * zmax * c / NC;
      const p = pt(y, z); pos.push(p.x, p.y, p.z);
    }
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
      const a = r * (NC + 1) + c, b = a + NC + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    // outward check against the nose direction
    const nrm = g.attributes.normal;
    if (nrm.getX(Math.floor(nrm.count / 2)) < 0) {
      const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      g.index.needsUpdate = true; g.computeVertexNormals();
    }
    const visor = mesh(g, M.lidar, 'sensor-visor');
    root.add(visor);
    // apertures inside the visor
    const ap = (z, r, mat) => {
      const p = pt(yb, z), q = pt(yb, z + 0.001);
      const x2 = onNose(yb, z);
      const e = 0.0006, X = x2;
      const gg = (dx, dz) => { const Xc = Math.min(X + dx, XN - 0.002); return Math.abs((z + dz) / Math.max(halfW(Xc), 1e-4)) ** NEXP + Math.abs((yb - yc(Xc)) / Math.max(halfH(Xc), 1e-4)) ** NEXP; };
      const n = V(gg(e, 0) - gg(-e, 0), 0, gg(0, e) - gg(0, -e)).normalize();
      const m = mesh(new THREE.CircleGeometry(r, 28), mat);
      m.position.copy(p).addScaledVector(n, 0.0004);
      m.quaternion.setFromUnitVectors(V(0, 0, 1), n);
      root.add(m);
    };
    ap(-0.0095, 0.0032, M.glass); ap(0.0095, 0.0032, M.glass);       // LiDAR pair
    ap(-0.034, 0.0042, M.glass); ap(0.034, 0.0042, M.glass);         // camera pair
  }

  // RTK GNSS antenna dome on the fuselage spine, behind the wing
  {
    const x = -0.25, top = yc(x) + halfH(x);
    const dome = mesh(new THREE.SphereGeometry(0.024, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), M.white);
    dome.scale.y = 0.5; dome.position.set(x, top - 0.003, 0);
    const base = mesh(new THREE.CylinderGeometry(0.026, 0.027, 0.006, 36), M.dark);
    base.position.set(x, top - 0.002, 0);
    root.add(base, dome);
  }

  // landing gear: raked legs under each boom, joined by a skid tube
  {
    const legG = new THREE.CylinderGeometry(0.0068, 0.0068, 1, 16);
    const footY = -0.205, legX = [0.17, -0.27];
    [-1, 1].forEach((side) => {
      const zb = side * LAYOUT.boomZ, zf = side * (LAYOUT.boomZ + 0.05);
      legX.forEach((x, k) => {
        const a = V(x, LAYOUT.boomY - boomR * 0.4, zb);
        const b = V(x + (k ? -0.03 : 0.03), footY + 0.01, zf);
        const leg = mesh(legG, M.carbon);
        leg.scale.y = a.distanceTo(b);
        leg.position.copy(a).add(b).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
        root.add(leg);
      });
      const x0 = legX[0] + 0.07, x1 = legX[1] - 0.07;
      const skidG = new THREE.CapsuleGeometry(0.0085, x0 - x1, 6, 16);
      skidG.rotateZ(Math.PI / 2);
      const skid = mesh(skidG, M.carbon);
      skid.position.set((x0 + x1) / 2, footY + 0.002, zf);
      root.add(skid);
    });
  }

  // ------------------------------------------------------------------
  // flight modes and animation
  // hover:  lift rotors spinning, pusher parked
  // cruise: lift rotors parked fore-aft along the booms, pusher spinning
  // ------------------------------------------------------------------
  let mode = 'idle';
  const SPIN = 38;            // visual rad/s at full rotor speed
  function setMode(m) { mode = m; }
  function update(dt, t = 0) {
    const liftTarget = mode === 'hover' ? 1 : 0;
    const pushTarget = mode === 'cruise' ? 1 : 0;
    rotors.forEach((r) => {
      r.speed += (liftTarget - r.speed) * Math.min(1, dt * 2.2);
      if (r.speed > 0.02) r.angle += r.dir * SPIN * r.speed * dt;
      else {
        // settle to the nearest fore-aft parking angle
        const target = Math.round(r.angle / Math.PI) * Math.PI;
        r.angle += (target - r.angle) * Math.min(1, dt * 4);
      }
      r.prop.rotation.y = r.angle;
      r.disc.material.opacity = Math.min(1, Math.max(0, (r.speed - 0.25) / 0.5)) * 0.9;
      r.prop.userData.blades.forEach((b) => { b.material = r.speed > 0.6 ? M.carbonFade : M.carbon; });
    });
    pusher.speed += (pushTarget - pusher.speed) * Math.min(1, dt * 2.2);
    if (pusher.speed > 0.02) pusher.angle += SPIN * 1.2 * pusher.speed * dt;
    pusher.prop.rotation.y = pusher.angle;
    pusher.disc.material.opacity = Math.min(1, Math.max(0, (pusher.speed - 0.25) / 0.5)) * 0.9;
    pusher.prop.userData.blades.forEach((b) => { b.material = pusher.speed > 0.6 ? M.carbonFade : M.carbon; });
  }
  // put everything straight into a mode without easing (for stills)
  function snap(m) {
    mode = m;
    rotors.forEach((r) => { r.speed = m === 'hover' ? 1 : 0; if (m !== 'hover') r.angle = 0; });
    pusher.speed = m === 'cruise' ? 1 : 0;
    update(0);
  }
  function aimGimbal(pan, tilt) { gimbal.pan.rotation.y = pan; gimbal.tilt.rotation.z = -0.28 + tilt; }

  return { group: root, parts, materials: M, setMode, snap, update, aimGimbal, get mode() { return mode; } };
}

// ---------------------------------------------------------------------
function makeMaterials(THREE, opt) {
  const white = new THREE.MeshPhysicalMaterial({
    color: 0xf1f2f4, roughness: 0.33, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.09,
  });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x2a2c30, roughness: 0.38, metalness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const graphite = new THREE.MeshPhysicalMaterial({ color: 0x3a3d42, roughness: 0.42, metalness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const carbon = new THREE.MeshPhysicalMaterial({ color: 0x141517, roughness: 0.45, metalness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  const carbonFade = carbon.clone(); carbonFade.transparent = true; carbonFade.opacity = 0.18; carbonFade.depthWrite = false;
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.9, metalness: 0 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xc3c8cf, roughness: 0.25, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x06070a, roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02,
    iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 520],
  });
  const glassIR = new THREE.MeshPhysicalMaterial({ color: 0x0b0a08, roughness: 0.12, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.05 });
  const lidar = new THREE.MeshPhysicalMaterial({ color: 0x1a0507, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
  return { white, dark, graphite, carbon, carbonFade, rubber, silver, glass, glassIR, lidar };
}
