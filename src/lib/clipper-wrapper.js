// Wrapper to properly import ClipperLib UMD module
import './clipper.min.js'

// ClipperLib is attached to window in browser or global in Node
const ClipperLib = globalThis.ClipperLib || window?.ClipperLib

if (!ClipperLib) {
  throw new Error('ClipperLib not found. Make sure clipper.min.js is loaded correctly.')
}

export default ClipperLib