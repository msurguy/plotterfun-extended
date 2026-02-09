// Wrapper to properly import ClipperLib UMD module
import './clipper.min.js'

// ClipperLib is attached to self/globalThis by clipper.min.js
const ClipperLib = globalThis.ClipperLib

if (!ClipperLib) {
  throw new Error('ClipperLib not found. Make sure clipper.min.js is loaded correctly.')
}

export default ClipperLib