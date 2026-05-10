// Runtime config. Overwrite this single file at deploy time to point the
// frontend at a different backend without rebuilding the bundle.
//
// Production points at the deployed Cloudflare Worker. For local dev,
// override by editing this file or by setting window.SMARTIES_BACKEND
// before the prototype loads.
window.SMARTIES_BACKEND =
  location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? "http://localhost:8787"
    : "https://smarties-backend.7ommyquak.workers.dev";
