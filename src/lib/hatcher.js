// Code below is by Lionel Radisson from https://observablehq.com/@makio135/utilities
import PVector from 'pvectorjs'
import ClipperLib from './clipper-wrapper.js'

const PI = Math.PI
export const TAU = PI * 2

// Function to convert degrees to radians
export const degreesToRadians = (degrees) => {
  return degrees * (Math.PI / 180);
}

// Function to convert radians to degrees
const radiansToDegrees = (radians) => {
  return radians * (180 / Math.PI);
}

export { PVector }

export function getPotracePaths(pathList, size, opt_type) {
  let paths = []
  function path(curve) {

    function bezier(i) {
      let b = 'C ' + (curve.c[i * 3 + 0].x * size).toFixed(3) + ' ' +
        (curve.c[i * 3 + 0].y * size).toFixed(3) + ',';
      b += (curve.c[i * 3 + 1].x * size).toFixed(3) + ' ' +
        (curve.c[i * 3 + 1].y * size).toFixed(3) + ',';
      b += (curve.c[i * 3 + 2].x * size).toFixed(3) + ' ' +
        (curve.c[i * 3 + 2].y * size).toFixed(3) + ' ';
      return b;
    }

    function segment(i) {
      let s = 'L ' + (curve.c[i * 3 + 1].x * size).toFixed(3) + ' ' +
        (curve.c[i * 3 + 1].y * size).toFixed(3) + ' ';
      s += (curve.c[i * 3 + 2].x * size).toFixed(3) + ' ' +
        (curve.c[i * 3 + 2].y * size).toFixed(3) + ' ';
      return s;
    }

    let n = curve.n;
    let p = 'M' + (curve.c[(n - 1) * 3 + 2].x * size).toFixed(3) +
      ' ' + (curve.c[(n - 1) * 3 + 2].y * size).toFixed(3) + ' ';
    for (let i = 0; i < n; i++) {
      if (curve.tag[i] === "CURVE") {
        p += bezier(i);
      } else if (curve.tag[i] === "CORNER") {
        p += segment(i);
      }
    }
    return p;
  }
  let len = pathList.length
  for (let i = 0; i < len; i++) {
    paths.push(path(pathList[i].curve));
  }

  return paths
}

const modularDist = (value, mod) => Math.abs(value - mod * Math.round(value / mod))

const lineLineIntersection = (p0, p1, p2, p3) => {
  const A1 = p1.y - p0.y
  const B1 = p0.x - p1.x
  const C1 = A1 * p0.x + B1 * p0.y
  const A2 = p3.y - p2.y
  const B2 = p2.x - p3.x
  const C2 = A2 * p2.x + B2 * p2.y
  const denominator = A1 * B2 - A2 * B1

  if (denominator == 0) return null

  return PVector((B2 * C1 - B1 * C2) / denominator, (A1 * C2 - A2 * C1) / denominator)
}

const segSegIntersection = (s1, s2) => {
  const x1 = s1.a.x
  const y1 = s1.a.y
  const x2 = s1.b.x
  const y2 = s1.b.y

  const x3 = s2.a.x
  const y3 = s2.a.y
  const x4 = s2.b.x
  const y4 = s2.b.y

  const bx = x2 - x1
  const by = y2 - y1
  const dx = x4 - x3
  const dy = y4 - y3

  const b_dot_d_perp = bx * dy - by * dx
  if (b_dot_d_perp == 0) return null

  const cx = x3 - x1
  const cy = y3 - y1

  const t = (cx * dy - cy * dx) / b_dot_d_perp
  if (t < 0 || t > 1) return null

  const u = (cx * by - cy * bx) / b_dot_d_perp
  if (u < 0 || u > 1) return null

  return PVector(x1 + t * bx, y1 + t * by)
}

const raySegIntersection = (ray, seg) => {
  // ray is defined by its emitting position (pos) and a direction (dir)
  // seg is defined between 2 points "a" and "b"
  const x1 = seg.a.x
  const y1 = seg.a.y
  const x2 = seg.b.x
  const y2 = seg.b.y

  const x3 = ray.pos.x
  const y3 = ray.pos.y
  const x4 = ray.pos.x + ray.dir.x
  const y4 = ray.pos.y + ray.dir.y

  const bx = x1 - x2
  const by = y1 - y2

  const den = bx * (y3 - y4) - by * (x3 - x4)
  if (den === 0) return undefined

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
  const u = -(bx * (y1 - y3) - by * (x1 - x3)) / den
  if (t >= 0 && t <= 1 && u > 0) return PVector(x1 + t * (x2 - x1), y1 + t * (y2 - y1))

  return null
}

const lineLineIntersect = (p0, p1, p2, p3) => {
  const A1 = p1.y - p0.y
  const B1 = p0.x - p1.x
  const C1 = A1 * p0.x + B1 * p0.y
  const A2 = p3.y - p2.y
  const B2 = p2.x - p3.x
  const C2 = A2 * p2.x + B2 * p2.y
  const denominator = A1 * B2 - A2 * B1

  if (denominator === 0) return null

  return PVector((B2 * C1 - B1 * C2) / denominator, (A1 * C2 - A2 * C1) / denominator)
}

// let spline = new Spline(x1, y1, x2, y2, x3, y3, … xn, yn [, smoothness [, isClosed]])
class Spline {
  constructor(...pts) {
    pts = pts.flat()
    let smoothness = 1
    this.isClosed = false
    if (pts.length % 2 == 1) {
      smoothness = pts.pop()
    }
    else if (typeof pts[pts.length - 1] === 'boolean') {
      this.isClosed = pts.pop()
      smoothness = pts.pop()
    }

    this.pts = pts.reduce((acc, curr, i) => {
      if (!acc[i / 2 | 0]) acc[i / 2 | 0] = {}
      acc[i / 2 | 0][['x', 'y'][i % 2]] = curr
      return acc
    }, [])

    this.centers = []
    for (let i = 0; i < this.pts.length - (this.isClosed ? 0 : 1); i++) {
      const { x: x1, y: y1 } = this.pts[i % this.pts.length]
      const { x: x2, y: y2 } = this.pts[(i + 1) % this.pts.length]
      this.centers[i % this.pts.length] = {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2
      }
    }

    this.ctrls = this.isClosed ? [] : [[this.pts[0], this.pts[0]]]
    for (let i = this.isClosed ? 0 : 1; i < this.centers.length; i++) {
      const pt = this.pts[i]
      const c0 = this.centers[(this.centers.length + i - 1) % this.centers.length]
      const c1 = this.centers[i]
      const dx = (c0.x - c1.x) / 2
      const dy = (c0.y - c1.y) / 2

      this.ctrls[i] = [
        {
          x: pt.x + smoothness * dx,
          y: pt.y + smoothness * dy
        },
        {
          x: pt.x - smoothness * dx,
          y: pt.y - smoothness * dy
        }
      ]
    }

    if (!this.isClosed) {
      this.ctrls.push([
        this.pts[this.pts.length - 1],
        this.pts[this.pts.length - 1]
      ])
    }

    this.d = `M${this.pts[0].x},${this.pts[0].y} ${this.centers.map((d, i) => `C${this.ctrls[i][1].x},${this.ctrls[i][1].y},${this.ctrls[(i + 1) % this.pts.length][0].x},${this.ctrls[(i + 1) % this.pts.length][0].y},${this.pts[(i + 1) % this.pts.length].x},${this.pts[(i + 1) % this.pts.length].y}`).join(' ')}`
    this.path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    this.path.setAttribute('d', this.d)
    this.pathLen = this.path.getTotalLength()
  }

  // drawPts, drawCtrls and drawCenter are color strings
  drawSpline(ctx, drawPts = false, drawCtrls = false, drawCenters = false) {
    const { pts, ctrls, centers } = this

    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 0; i < centers.length; i++) {
      ctx.bezierCurveTo(
        ctrls[i][1].x, ctrls[i][1].y,
        ctrls[(i + 1) % pts.length][0].x, ctrls[(i + 1) % pts.length][0].y,
        pts[(i + 1) % pts.length].x, pts[(i + 1) % pts.length].y
      )
    }
    ctx.stroke()

    if (drawPts) {
      ctx.fillStyle = drawPts
      pts.forEach(({ x, y }) => ctx.square(x, y, 10))
    }

    if (drawCtrls) {
      ctx.fillStyle = drawCtrls
      ctx.strokeStyle = drawCtrls
      ctx.lineWidth = 1
      ctrls.forEach(([ctrl0, ctrl1]) => {
        const { x: x0, y: y0 } = ctrl0
        const { x: x1, y: y1 } = ctrl1

        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()

        ctx.square(x0, y0, 10)
        ctx.square(x1, y1, 10)
      })
    }

    if (drawCenters) {
      centers.forEach((c, i) => {
        ctx.strokeStyle = drawCenters
        ctx.beginPath()
        ctx.moveTo(pts[i].x, pts[i].y)
        ctx.lineTo(pts[(i + 1) % pts.length].x, pts[(i + 1) % pts.length].y)
        ctx.stroke()

        ctx.fillStyle = drawCenters
        ctx.square(c.x, c.y, 10)
      })
    }
  }

  getSVGPath() {
    return this.d
  }

  getPtAt(t) {
    return this.path.getPointAtLength(t * this.pathLen)
  }
}

class Ray {
  constructor(pos, dir) {
    this.pos = pos.clone()
    this.dir = dir.clone()
  }
}

class Segment {
  constructor(a, b) {
    this.a = a.clone()
    this.b = b.clone()
    this.center = this.pointAt(0.5)
    this.dx = this.a.distX(this.b)
    this.dy = this.a.distY(this.b)
  }

  getLength() {
    return PVector.sub(this.b, this.a).mag()
  }

  getAngle() {
    return PVector.sub(this.b, this.a).angle2D()
  }

  pointAt(n) {
    return PVector.lerp(this.a, this.b, n)
  }
  reduce(n) {
    const ab = PVector.sub(this.b, this.a).setMag(n)
    this.a.add(ab)
    this.b.sub(ab)
    this.center = this.pointAt(0.5)
    this.dx = this.a.distX(this.b)
    this.dy = this.a.distY(this.b)
  }
}

// Polyline class for open paths
class Polyline {
  constructor(...pts) {
    this.pts = pts.map(pt => pt.clone());
    this.segments = pts.slice(0, -1).map((pt, i) => new Segment(pt, pts[i + 1]));
  }

  // Function to convert the polyline to a Clipper path
  toClipperPath() {
    return this.pts.map(pt => ({ X: pt.x * 100, Y: pt.y * 100 }));
  }
}

export class Polygon {
  // create a new Polygon from SVG path string
  static fromPath(path, lengthBetweenPts = 5) {
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    pathElement.setAttribute('d', path)
    const pathLength = pathElement.getTotalLength()
    const poly = new Polygon(...array(pathLength / lengthBetweenPts | 0).map((i) => {
      return PVector(pathElement.getPointAtLength(i * lengthBetweenPts))
    }))
    poly.originalPath = path
    return poly
  }

  // Boolean operations using ClipperLib https://sourceforge.net/p/jsclipper/wiki/Home%206/
  static intersection(p1, p2) {
    const INTERSECTION = ClipperLib.ClipType.ctIntersection
    return Polygon.boolOp(INTERSECTION, p1, p2)
  }

  static union(p1, p2) {
    const UNION = ClipperLib.ClipType.ctUnion
    return Polygon.boolOp(UNION, p1, p2)
  }

  static diff(p1, p2) {
    const DIFF = ClipperLib.ClipType.ctDifference
    return Polygon.boolOp(DIFF, p1, p2)
  }

  static xor(p1, p2) {
    const XOR = ClipperLib.ClipType.ctXor
    return Polygon.boolOp(XOR, p1, p2)
  }

  static boolOp(type, p1, p2) {
    // eslint-disable-next-line camelcase
    const polygonToClipperPath = p => p.pts.map(pt => ({ X: pt.x * 100, Y: pt.y * 100 }))

    const subj_paths = [polygonToClipperPath(p1)]
    // eslint-disable-next-line camelcase
    const clip_paths = [polygonToClipperPath(p2)]

    const clipper = new ClipperLib.Clipper()
    const SUBJECT = ClipperLib.PolyType.ptSubject // 0
    const CLIP = ClipperLib.PolyType.ptClip // 1
    clipper.AddPaths(subj_paths, SUBJECT, true)
    clipper.AddPaths(clip_paths, CLIP, true)

    const result = []

    const EVEN_ODD = ClipperLib.PolyFillType.pftEvenOdd // 0
    const NON_ZERO = ClipperLib.PolyFillType.pftNonZero // 1
    const POSITIVE = ClipperLib.PolyFillType.pftPositive // 2
    const NEGATIVE = ClipperLib.PolyFillType.pftNegative // 3
    clipper.Execute(type, result, NON_ZERO, NON_ZERO)

    return result.map(pts => new Polygon(...pts.map(pt => PVector(pt.X / 100, pt.Y / 100))))
  }

  static offset(p, delta, type = 'round') {
    // scale up coords since Clipper is using integer
    const scale = 1000
    let paths = [p.pts.map(pt => ({ X: pt.x * scale, Y: pt.y * scale }))]

    // Simplifying
    paths = ClipperLib.Clipper.SimplifyPolygons(paths, ClipperLib.PolyFillType.pftNonZero)

    // Cleaning
    var cleandelta = 0.1 // 0.1 should be the appropriate delta in different cases
    paths = ClipperLib.JS.Clean(paths, cleandelta * scale)

    // Create an instance of ClipperOffset object
    var co = new ClipperLib.ClipperOffset()

    const jointType = type === 'miter' ? ClipperLib.JoinType.jtMiter :
      type === 'square' ? ClipperLib.JoinType.jtSquare :
        ClipperLib.JoinType.jtRound

    // Add paths
    co.AddPaths(paths, jointType, ClipperLib.EndType.etClosedPolygon)

    // Create an empty solution and execute the offset operation
    let offsetted_paths = new ClipperLib.Paths()
    co.Execute(offsetted_paths, delta * scale)

    ClipperLib.JS.ScaleDownPaths(offsetted_paths, scale)
    if (!(offsetted_paths[0] && offsetted_paths[0].length > 0)) return null
    return new Polygon(...offsetted_paths[0].map(pt => PVector(pt.X, pt.Y)))
  }

  constructor(...pts) {
    this.pts = pts.map(pt => pt.clone())
    this.segments = pts.map((pt, i) => new Segment(pt, pts[(i + 1) % pts.length]))
    this.center = new PVector(pts.reduce((acc, d) => PVector.add(acc, d), PVector())).div(pts.length)
  }

  // adapted from https://www.codeproject.com/tips/84226/is-a-point-inside-a-polygon
  contains(pt) {
    const pts = this.pts
    let c = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (
        ((pts[i].y > pt.y) !== (pts[j].y > pt.y)) &&
        (pt.x < (pts[j].x - pts[i].x) * (pt.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x)
      ) {
        c = !c
      }
    }
    return c
  }

  toClipperPath() {
    return this.pts.map(pt => ({ X: pt.x * 100, Y: pt.y * 100 }))
  }


  getBoundingBox() {
    const xs = this.pts.map(pt => pt.x)
    const ys = this.pts.map(pt => pt.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      origin: PVector(minX, minY),
      width: maxX - minX,
      height: maxY - minY,
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY
    }
  }

  getHatchesParametric(originalAngle = PI / 2, startSpacing = 1, endSpacing = 10, func = t => t, offset = 0, alternate = false) {
    if (offset !== 0) return Polygon.offset(this, -offset).getHatchesParametric(originalAngle, startSpacing, endSpacing, func, 0, alternate)

    //bounding box
    const originalBB = this.getBoundingBox()
    const bb = {
      origin: originalBB.origin.clone().sub(Math.min(startSpacing, endSpacing) * 2),
      width: originalBB.width + 4 * Math.min(startSpacing, endSpacing),
      height: originalBB.height + 4 * Math.min(startSpacing, endSpacing)
    }

    // hatches
    let angle = ((originalAngle % TAU) + TAU) % PI
    if (angle > PI / 2) angle -= PI
    if (modularDist(angle, PI / 2) < 0.00001) angle += 0.00001
    const hatchDirOriginal = PVector.fromAngle(originalAngle).setMag(1000)
    const hatchDir = PVector.fromAngle(angle).setMag(1000)

    let startY, endY
    let leftPoint, rightPoint

    if (angle < 0) {
      rightPoint = bb.origin.clone().add(PVector(bb.width, bb.height))
      startY = bb.origin.y
      endY = lineLineIntersection(
        bb.origin,
        bb.origin.clone().addY(bb.height),
        rightPoint,
        rightPoint.clone().sub(hatchDir)
      ).y
      leftPoint = PVector(bb.origin.x, endY)
    }
    else {
      rightPoint = bb.origin.clone().addX(bb.width)
      startY = lineLineIntersection(
        bb.origin,
        bb.origin.clone().addY(bb.height),
        rightPoint,
        rightPoint.clone().sub(hatchDir)
      ).y
      endY = bb.origin.y + bb.height
      leftPoint = PVector(bb.origin.x, startY)
    }

    const hatches = []
    for (let y = startY, stepY = startSpacing, i = 0; y < endY; y += stepY) {
      const segA = new Segment(PVector(bb.origin.x, startY), PVector(bb.origin.x, endY))
      const segB = new Segment(leftPoint, rightPoint)

      const t = (y - startY) / (endY - startY)
      const d = startSpacing + (endSpacing - startSpacing) * func(t)
      const step = hatchDir.clone().rotateBy(PI / 2).setMag(d)
      const stepProjection = hatchDir.clone().mult(angle < 0 ? -1 : 1).add(step)
      const stepIntersection = lineLineIntersection(segA.a, segA.b, PVector.add(bb.origin, step), PVector.add(bb.origin, stepProjection))
      stepY = stepIntersection.y - bb.origin.y

      const A = PVector(bb.origin.x, y)
      const B = A.clone().add(hatchDir)
      const ray = new Ray(A, hatchDir)

      const intersections = this.segments.map(seg => raySegIntersection(ray, seg))
        .filter(d => d)
        .sort((a, b) => a.y > b.y ? 1 :
          a.y < b.y ? -1 :
            a.x > b.x ? 1 :
              a.x < b.x ? -1 : 0)

      if (intersections.length < 2) continue;
      else {
        if (alternate && i % 2) intersections.reverse()

        const segments = []
        for (let i = 0; i < intersections.length && intersections[i + 1]; i += 2) {
          segments.push(new Segment(intersections[i], intersections[i + 1]))
        }

        hatches.push(segments)
        i++
      }
    }

    return hatches.filter(d => d).flat().filter(seg => this.contains(seg.pointAt(0.3)))
  }


  // getHatches (originalAngle = PI / 2, spacing = 2, alternate = false) {
  //   // bounding box
  //   const originalBB = this.getBoundingBox()
  //   const bb = {
  //     origin: originalBB.origin.clone().sub(spacing * 2),
  //     width: originalBB.width + 4 * spacing,
  //     height: originalBB.height + 4 * spacing
  //   }

  //   // hashes
  //   let angle = ((originalAngle % TAU) + TAU) % PI
  //   if (angle > PI / 2) { angle -= PI }
  //   if (angle === 0 || angle === PI / 2) { angle += 0.00001 }
  //   const hatchDir = PVector.fromAngle(angle).setMag(1000)

  //   let startY, endY
  //   // eslint-disable-next-line no-unused-vars
  //   let leftPoint, rightPoint

  //   if (angle < 0) {
  //     rightPoint = bb.origin.clone().add(PVector(bb.width, bb.height))
  //     startY = bb.origin.y
  //     endY = lineLineIntersect(
  //       bb.origin,
  //       bb.origin.clone().addY(bb.height),
  //       rightPoint,
  //       rightPoint.clone().sub(hatchDir)
  //     ).y
  //     // eslint-disable-next-line no-unused-vars
  //     leftPoint = PVector(bb.origin.x, endY)
  //   } else {
  //     rightPoint = bb.origin.clone().addX(bb.width)
  //     startY = lineLineIntersect(
  //       bb.origin,
  //       bb.origin.clone().addY(bb.height),
  //       rightPoint,
  //       rightPoint.clone().sub(hatchDir)
  //     ).y
  //     endY = bb.origin.y + bb.height
  //     // eslint-disable-next-line no-unused-vars
  //     leftPoint = PVector(bb.origin.x, startY)
  //   }

  //   const segA = new Segment(PVector(bb.origin.x, startY), PVector(bb.origin.x, endY))

  //   const step = hatchDir.clone().rotateBy(PI / 2).setMag(spacing)
  //   const stepProjection = hatchDir.clone().mult(angle < 0 ? -1 : 1).add(step)
  //   const stepIntersection = lineLineIntersect(segA.a, segA.b, PVector.add(bb.origin, step), PVector.add(bb.origin, stepProjection))
  //   const stepY = stepIntersection.y - bb.origin.y

  //   const hatches = array(((endY - startY) / stepY | 0) + 1).map((i) => {
  //     const A = PVector(bb.origin.x, startY + i * stepY)
  //     // eslint-disable-next-line no-unused-vars
  //     const B = A.clone().add(hatchDir)
  //     const ray = new Ray(A, hatchDir)

  //     const intersections = this.segments.map(seg => raySegIntersection(ray, seg))
  //       .filter(d => d)
  //       .sort((a, b) => a.y > b.y ? 1
  //         : a.y < b.y ? -1
  //           : a.x > b.x ? 1
  //             : a.x < b.x ? -1 : 0)

  //     if (intersections.length < 2) { return null }

  //     if (alternate && i % 2) { intersections.reverse() }

  //     const segments = []
  //     for (let i = 0; i < intersections.length && intersections[i + 1]; i += 2) {
  //       segments.push(new Segment(intersections[i], intersections[i + 1]))
  //     }
  //     return segments
  //   }).filter(d => d).flat().filter(seg => this.contains(seg.pointAt(0.3)))

  //   return hatches
  // }

  getHatches(originalAngle = PI / 2, spacing = 2, offset = 0, alternate = false) {
    return this.getHatchesParametric(originalAngle, spacing, spacing, t => t, offset, alternate)
  }

  getHatches2(originalAngle = PI / 2, startSpacing = 1, endSpacing = 10, power = 1, offset = 0, alternate = false) {
    return this.getHatchesParametric(originalAngle, startSpacing, endSpacing, t => t ** power, offset, alternate)
  }
}

export const array = n => new Array(n).fill(0).map((d, i) => i)

export const pathFromPolygon = p => p.originalPath ? p.originalPath : `${p.pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`).join(' ')} Z`
export const pathFromHatches = hatches => `${hatches.map((seg, i) => `${i === 0 ? 'M' : 'L'}${seg.a.x} ${seg.a.y} L${seg.b.x} ${seg.b.y}`).join(' ')}`

export const hatch = (polys = [], originalAngle = 0, spacing = 2, alternate = false) => {
  const boundingPoly = new Polygon(...polys.map(p => p.pts).flat())
  // bounding box
  const originalBB = boundingPoly.getBoundingBox()
  const bb = {
    origin: originalBB.origin.clone().sub(spacing * 2),
    width: originalBB.width + 4 * spacing,
    height: originalBB.height + 4 * spacing
  }

  // hashes
  let angle = ((originalAngle % TAU) + TAU) % PI
  if (angle > PI / 2) { angle -= PI }
  if (angle === 0 || angle === PI / 2) { angle += 0.0001 }
  const hatchDir = PVector.fromAngle(angle).setMag(1000)

  let startY, endY
  // eslint-disable-next-line no-unused-vars
  let leftPoint, rightPoint

  if (angle < 0) {
    rightPoint = bb.origin.clone().add(PVector(bb.width, bb.height))
    startY = bb.origin.y
    endY = lineLineIntersect(
      bb.origin,
      bb.origin.clone().addY(bb.height),
      rightPoint,
      rightPoint.clone().sub(hatchDir)
    ).y
    leftPoint = PVector(bb.origin.x, endY)
  } else {
    rightPoint = bb.origin.clone().addX(bb.width)
    startY = lineLineIntersect(
      bb.origin,
      bb.origin.clone().addY(bb.height),
      rightPoint,
      rightPoint.clone().sub(hatchDir)
    ).y
    endY = bb.origin.y + bb.height
    // eslint-disable-next-line no-unused-vars
    leftPoint = PVector(bb.origin.x, startY)
  }

  const segA = new Segment(PVector(bb.origin.x, startY), PVector(bb.origin.x, endY))

  const step = hatchDir.clone().rotateBy(PI / 2).setMag(spacing)
  const stepProjection = hatchDir.clone().mult(angle < 0 ? -1 : 1).add(step)
  const stepIntersection = lineLineIntersect(segA.a, segA.b, PVector.add(bb.origin, step), PVector.add(bb.origin, stepProjection))
  const stepY = stepIntersection.y - bb.origin.y

  const hatches = array(((endY - startY) / stepY | 0) + 1).map((i) => {
    const A = PVector(bb.origin.x, startY + i * stepY)
    const ray = new Ray(A, hatchDir)

    const intersections = polys.map(p => p.segments).flat().map(seg => raySegIntersection(ray, seg))
      .filter(d => d)
      .sort((a, b) => a.y > b.y ? 1
        : a.y < b.y ? -1
          : a.x > b.x ? 1
            : a.x < b.x ? -1 : 0)

    if (intersections.length < 2) { return null }

    if (alternate && i % 2) { intersections.reverse() }

    const segments = []
    for (let i = 0; i < intersections.length && intersections[i + 1]; i += 2) {
      segments.push(new Segment(intersections[i], intersections[i + 1]))
    }
    return segments
  }).filter(d => d).flat()

  return { hatches, originalBB }
}

function createNGonPolygon(center, radius, numSides = 6) {
  const angleStep = TAU / numSides;
  const pts = [];
  for (let i = 0; i < numSides; i++) {
    const angle = i * angleStep;
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    pts.push(PVector(x, y));
  }
  return new Polygon(...pts);
}


export const pathFromPolyline = (p) => `${p.pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`).join(' ')}`;

// Shape generator factory
export function createShapeGenerator(shapeType, params = {}) {
  switch (shapeType) {
    case 'circle':
      return (position) => createCirclePolygon(position, params.radius || 5);
    case 'nGon':
      return (position) => createNGonPolygon(position, params.radius || 5, params.sides || 6);
    case 'wavyLine':
      return (position) => createWavyLinePolyline(position, params.length || 10, params.amplitude || 2, params.frequency || 5);
    case 'zigzag':
      return (position) => createZigZagPolyline(position, params.length || 10, params.amplitude || 2, params.segments || 5);
    case 'star':
      return (position) => createStarPolygon(position, params.outerRadius || 5, params.innerRadius || 2.5, params.points || 5);
    case 'cross':
      return (position) => createCrossPolygon(position, params.size || 5, params.thickness || 2);
    case 'heart':
      return (position) => createHeartPolygon(position, params.size || 5);
    case 'triangle':
      return (position) => createTrianglePolygon(position, params.size || 5);
    case 'square':
      return (position) => createSquarePolygon(position, params.size || 5);
    case 'diamond':
      return (position) => createDiamondPolygon(position, params.size || 5);
    case 'arrow':
      return (position) => createArrowPolygon(position, params.size || 5, params.headSize || 3);
    case 'spiral':
      return (position) => createSpiralPolyline(position, params.turns || 2, params.radius || 5);
    case 'leaf':
      return (position) => createLeafPolygon(position, params.size || 5);
    case 'droplet':
      return (position) => createDropletPolygon(position, params.size || 5);
    case 'cloud':
      return (position) => createCloudPolygon(position, params.size || 5, params.bumps || 5);
    case 'line':
      return (position) => createLinePolyline(position, params.length || 10, params.angle || 0);
    case 'dashedLine':
      return (position) => createDashedLinePolyline(position, params.length || 10, params.dashLength || 2, params.gapLength || 1, params.angle || 0);
    case 'hexagon':
      return (position) => createHexagonPolygon(position, params.radius || 5);
    case 'octagon':
      return (position) => createOctagonPolygon(position, params.radius || 5);
    case 'oval':
      return (position) => createOvalPolygon(position, params.width || 8, params.height || 4);
    case 'plus':
      return (position) => createPlusPolygon(position, params.size || 5, params.thickness || 1);
    case 'ring':
      return (position) => createRingPolygon(position, params.outerRadius || 5, params.innerRadius || 3);
    case 'gear':
      return (position) => createGearPolygon(position, params.outerRadius || 5, params.innerRadius || 3, params.teeth || 8);
    default:
      throw new Error('Unknown shape type');
  }
}

// Function to generate a circle polygon at a given position
export function createCirclePolygon(center, radius, numSegments = 20) {
  const angleStep = TAU / numSegments;
  const pts = [];
  for (let i = 0; i < numSegments; i++) {
    const angle = i * angleStep;
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    pts.push(PVector(x, y));
  }
  return new Polygon(...pts);
}

export function createZigZagPolygon(center, length = 10, amplitude = 2, segments = 5) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = center.x + (t - 0.5) * length;
    const y = center.y + (i % 2 === 0 ? -amplitude : amplitude);
    pts.push(PVector(x, y));
  }
  return new Polygon(...pts);
}

function createStarPolygon(center, outerRadius = 5, innerRadius = 2.5, numPoints = 5) {
  const angleStep = TAU / (numPoints * 2);
  const pts = [];
  for (let i = 0; i < numPoints * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * angleStep;
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    pts.push(PVector(x, y));
  }
  return new Polygon(...pts);
}

// New shape functions
function createCrossPolygon(center, size = 5, thickness = 2) {
  const halfThickness = thickness / 2;
  const pts = [
    PVector(center.x - halfThickness, center.y - size),
    PVector(center.x + halfThickness, center.y - size),
    PVector(center.x + halfThickness, center.y - halfThickness),
    PVector(center.x + size, center.y - halfThickness),
    PVector(center.x + size, center.y + halfThickness),
    PVector(center.x + halfThickness, center.y + halfThickness),
    PVector(center.x + halfThickness, center.y + size),
    PVector(center.x - halfThickness, center.y + size),
    PVector(center.x - halfThickness, center.y + halfThickness),
    PVector(center.x - size, center.y + halfThickness),
    PVector(center.x - size, center.y - halfThickness),
    PVector(center.x - halfThickness, center.y - halfThickness)
  ];
  return new Polygon(...pts);
}

function createHeartPolygon(center, size = 5) {
  const pts = [];
  const numPoints = 30; // Higher number for smoother curve

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints * TAU;
    // Heart curve parametric equation
    const x = center.x + size * 16 * Math.pow(Math.sin(t), 3) / 16;
    const y = center.y - size * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
    pts.push(PVector(x, y));
  }

  return new Polygon(...pts);
}

function createTrianglePolygon(center, size = 5) {
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i * TAU / 3) - Math.PI / 6; // Rotate to point up
    const x = center.x + size * Math.cos(angle);
    const y = center.y + size * Math.sin(angle);
    pts.push(PVector(x, y));
  }
  return new Polygon(...pts);
}

function createSquarePolygon(center, size = 5) {
  const halfSize = size / 2;
  const pts = [
    PVector(center.x - halfSize, center.y - halfSize),
    PVector(center.x + halfSize, center.y - halfSize),
    PVector(center.x + halfSize, center.y + halfSize),
    PVector(center.x - halfSize, center.y + halfSize)
  ];
  return new Polygon(...pts);
}

function createDiamondPolygon(center, size = 5) {
  const pts = [
    PVector(center.x, center.y - size),
    PVector(center.x + size, center.y),
    PVector(center.x, center.y + size),
    PVector(center.x - size, center.y)
  ];
  return new Polygon(...pts);
}

function createArrowPolygon(center, size = 5, headSize = 3) {
  const pts = [
    PVector(center.x, center.y - size), // Tip
    PVector(center.x + headSize, center.y - size + headSize), // Right corner
    PVector(center.x + headSize / 2, center.y - size + headSize), // Right shaft join
    PVector(center.x + headSize / 2, center.y + size), // Bottom right
    PVector(center.x - headSize / 2, center.y + size), // Bottom left
    PVector(center.x - headSize / 2, center.y - size + headSize), // Left shaft join
    PVector(center.x - headSize, center.y - size + headSize) // Left corner
  ];
  return new Polygon(...pts);
}

function createSpiralPolyline(center, turns = 2, radius = 5) {
  const pts = [];
  const numPoints = 50 * turns; // More points for smoother spiral

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints * turns * TAU;
    const r = (i / numPoints) * radius;
    const x = center.x + r * Math.cos(t);
    const y = center.y + r * Math.sin(t);
    pts.push(PVector(x, y));
  }

  return new Polyline(...pts);
}

function createLeafPolygon(center, size = 5) {
  const pts = [];
  const numPoints = 40; // Higher number for smoother curve

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints * TAU;
    // Leaf curve
    const r = size * (1 + Math.sin(t)) / 3;
    const x = center.x + r * Math.cos(t);
    const y = center.y + r * Math.sin(t) * 1.5; // Stretch vertically
    pts.push(PVector(x, y));
  }

  return new Polygon(...pts);
}

function createDropletPolygon(center, size = 5) {
  const pts = [];
  const numPoints = 30; // Higher number for smoother curve

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints * TAU;
    // Droplet shape
    const r = size * (1 - Math.sin(t) * 0.5);
    const x = center.x + r * Math.cos(t);
    const y = center.y + r * Math.sin(t) * 1.3; // Stretch vertically
    pts.push(PVector(x, y));
  }

  return new Polygon(...pts);
}

function createCloudPolygon(center, size = 5, bumps = 5) {
  const pts = [];
  const numPointsPerBump = 8;
  const totalPoints = bumps * numPointsPerBump;

  for (let i = 0; i < totalPoints; i++) {
    const t = i / totalPoints * TAU;
    // Cloud shape with bumpy edge
    const bumpFactor = 0.2 * Math.sin(bumps * t) + 1;
    const r = size * bumpFactor;
    const x = center.x + r * Math.cos(t);
    const y = center.y + r * Math.sin(t) * 0.7; // Flatten vertically
    pts.push(PVector(x, y));
  }

  return new Polygon(...pts);
}

// Shape creation functions for open paths
export function createWavyLinePolyline(center, length = 10, amplitude = 2, frequency = 5) {
  const pts = [];
  const numSegments = 20;
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const x = center.x + (t - 0.5) * length;
    const y = center.y + amplitude * Math.sin(t * frequency * TAU);
    pts.push(PVector(x, y));
  }
  return new Polyline(...pts);
}

export function createZigZagPolyline(center, length = 10, amplitude = 2, segments = 5) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = center.x + (t - 0.5) * length;
    const y = center.y + (i % 2 === 0 ? -amplitude : amplitude);
    pts.push(PVector(x, y));
  }
  return new Polyline(...pts);
}
// Function to generate SVG path from shape
export const pathFromShape = (shape) => {
  if (shape instanceof Polygon) {
    return pathFromPolygon(shape);
  } else if (shape instanceof Polyline) {
    return pathFromPolyline(shape);
  }
};

// New function to fill a polygon with a pattern of arbitrary shapes
export function patternFill(polys, shapeGenerator, options = {}) {
  const { spacing = 2, angle = 0 } = options;

  // Compute the combined bounding box of the polygons
  const boundingPoly = new Polygon(...polys.map(p => p.pts).flat());
  const originalBB = boundingPoly.getBoundingBox();
  const bb = {
    origin: originalBB.origin.clone().sub(spacing * 2),
    width: originalBB.width + 4 * spacing,
    height: originalBB.height + 4 * spacing
  };

  // Compute the center of the bounding box
  const centerX = bb.origin.x + bb.width / 2;
  const centerY = bb.origin.y + bb.height / 2;

  // Calculate the number of steps in x and y directions
  const diag = Math.sqrt(bb.width * bb.width + bb.height * bb.height);
  const stepsX = Math.ceil(diag / spacing);
  const stepsY = Math.ceil(diag / spacing);

  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  const positions = [];

  // Generate positions over the area, applying rotation
  for (let i = -stepsX; i <= stepsX; i++) {
    for (let j = -stepsY; j <= stepsY; j++) {
      // Compute the point in the grid
      const x = i * spacing;
      const y = j * spacing;

      // Rotate the point around the center
      const rx = x * cosAngle - y * sinAngle + centerX;
      const ry = x * sinAngle + y * cosAngle + centerY;

      const position = PVector(rx, ry);

      // Check if the position is within the bounding box
      if (
        rx >= bb.origin.x &&
        rx <= bb.origin.x + bb.width &&
        ry >= bb.origin.y &&
        ry <= bb.origin.y + bb.height
      ) {
        positions.push(position);
      }
    }
  }

  // For each position, generate the shape and clip it with the polygons
  const clippedShapes = [];

  for (let pos of positions) {
    // Generate the shape at the position
    const shape = shapeGenerator(pos);

    // Perform the clipping
    let clippedShape = null;
    //   console.log(shape)

    // Convert the shape and polygons to Clipper paths
    const shapePaths = [shape.toClipperPath()];
    const polyPaths = polys.map(p => p.toClipperPath());
    const cpr = new ClipperLib.Clipper();
    let solution

    if (shape instanceof Polyline) {
      // For open paths, add as subject with Closed set to false
      cpr.AddPaths(shapePaths, ClipperLib.PolyType.ptSubject, false);
      // Add the clip polygons
      cpr.AddPaths(polyPaths, ClipperLib.PolyType.ptClip, true);
      solution = new ClipperLib.PolyTree(); // Paths for not polyline

    } else {
      // For polygons, Closed is true
      cpr.AddPaths(shapePaths, ClipperLib.PolyType.ptSubject, true);
      cpr.AddPaths(polyPaths, ClipperLib.PolyType.ptClip, true);
      solution = new ClipperLib.Paths(); // Paths for not polyline
    }

    cpr.Execute(
      ClipperLib.ClipType.ctIntersection,
      solution,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero
    );

    if (shape instanceof Polyline) {
      solution = (ClipperLib.Clipper.OpenPathsFromPolyTree(solution))
    }

    // Convert the solution back to shapes
    if (solution.length > 0) {
      for (let path of solution) {
        const pts = path.map(pt => PVector(pt.X / 100, pt.Y / 100));
        if (shape instanceof Polyline) {
          // For open paths
          clippedShape = new Polyline(...pts);
        } else {
          // For polygons
          clippedShape = new Polygon(...pts);
        }
        clippedShapes.push(clippedShape);
      }
    }
  }

  return { clippedShapes, originalBB };
}

// New shape creation functions

// Simple line generator
function createLinePolyline(center, length = 10, angle = 0) {
  const halfLength = length / 2;
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  const startX = center.x - halfLength * cosAngle;
  const startY = center.y - halfLength * sinAngle;
  const endX = center.x + halfLength * cosAngle;
  const endY = center.y + halfLength * sinAngle;

  return new Polyline(PVector(startX, startY), PVector(endX, endY));
}

// Dashed line generator
function createDashedLinePolyline(center, length = 10, dashLength = 2, gapLength = 1, angle = 0) {
  const pts = [];
  const halfLength = length / 2;
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  const segmentLength = dashLength + gapLength;
  const numSegments = Math.floor(length / segmentLength);
  const startOffset = -halfLength + (length - numSegments * segmentLength) / 2;

  for (let i = 0; i < numSegments; i++) {
    const segmentStart = startOffset + i * segmentLength;
    const segmentEnd = segmentStart + dashLength;

    const startX = center.x + segmentStart * cosAngle;
    const startY = center.y + segmentStart * sinAngle;
    const endX = center.x + segmentEnd * cosAngle;
    const endY = center.y + segmentEnd * sinAngle;

    // Create individual line segments (dashes)
    pts.push(PVector(startX, startY));
    pts.push(PVector(endX, endY));
  }

  return new Polyline(...pts);
}

// Regular hexagon
function createHexagonPolygon(center, radius = 5) {
  return createNGonPolygon(center, radius, 6);
}

// Regular octagon
function createOctagonPolygon(center, radius = 5) {
  return createNGonPolygon(center, radius, 8);
}

// Oval/ellipse shape
function createOvalPolygon(center, width = 8, height = 4) {
  const pts = [];
  const numSegments = 30;
  const angleStep = TAU / numSegments;

  for (let i = 0; i < numSegments; i++) {
    const angle = i * angleStep;
    const x = center.x + (width / 2) * Math.cos(angle);
    const y = center.y + (height / 2) * Math.sin(angle);
    pts.push(PVector(x, y));
  }

  return new Polygon(...pts);
}

// Plus sign (similar to cross but thinner)
function createPlusPolygon(center, size = 5, thickness = 1) {
  const halfThickness = thickness / 2;
  const pts = [
    PVector(center.x - halfThickness, center.y - size),
    PVector(center.x + halfThickness, center.y - size),
    PVector(center.x + halfThickness, center.y - halfThickness),
    PVector(center.x + size, center.y - halfThickness),
    PVector(center.x + size, center.y + halfThickness),
    PVector(center.x + halfThickness, center.y + halfThickness),
    PVector(center.x + halfThickness, center.y + size),
    PVector(center.x - halfThickness, center.y + size),
    PVector(center.x - halfThickness, center.y + halfThickness),
    PVector(center.x - size, center.y + halfThickness),
    PVector(center.x - size, center.y - halfThickness),
    PVector(center.x - halfThickness, center.y - halfThickness)
  ];
  return new Polygon(...pts);
}

// Ring (donut) shape
function createRingPolygon(center, outerRadius = 5, innerRadius = 3) {
  const outerPts = [];
  const innerPts = [];
  const numSegments = 20;
  const angleStep = TAU / numSegments;

  // Create outer ring points
  for (let i = 0; i < numSegments; i++) {
    const angle = i * angleStep;
    const x = center.x + outerRadius * Math.cos(angle);
    const y = center.y + outerRadius * Math.sin(angle);
    outerPts.push(PVector(x, y));
  }

  // Create inner ring points (reversed for proper winding)
  for (let i = numSegments - 1; i >= 0; i--) {
    const angle = i * angleStep;
    const x = center.x + innerRadius * Math.cos(angle);
    const y = center.y + innerRadius * Math.sin(angle);
    innerPts.push(PVector(x, y));
  }

  return new Polygon(...outerPts, ...innerPts);
}

// Gear shape
function createGearPolygon(center, outerRadius = 5, innerRadius = 3, teeth = 8) {
  const pts = [];
  const toothAngle = TAU / teeth;
  const toothWidth = toothAngle * 0.3; // Tooth takes 30% of the segment

  for (let i = 0; i < teeth; i++) {
    const baseAngle = i * toothAngle;

    // Valley before tooth
    let angle = baseAngle - toothWidth / 2;
    pts.push(PVector(
      center.x + innerRadius * Math.cos(angle),
      center.y + innerRadius * Math.sin(angle)
    ));

    // Tooth start
    angle = baseAngle - toothWidth / 4;
    pts.push(PVector(
      center.x + outerRadius * Math.cos(angle),
      center.y + outerRadius * Math.sin(angle)
    ));

    // Tooth end
    angle = baseAngle + toothWidth / 4;
    pts.push(PVector(
      center.x + outerRadius * Math.cos(angle),
      center.y + outerRadius * Math.sin(angle)
    ));

    // Valley after tooth
    angle = baseAngle + toothWidth / 2;
    pts.push(PVector(
      center.x + innerRadius * Math.cos(angle),
      center.y + innerRadius * Math.sin(angle)
    ));
  }

  return new Polygon(...pts);
}
