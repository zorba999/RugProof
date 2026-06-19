// Quick probe of genlayer-js exports so we use the real API, not a guessed one.
import * as sdk from "genlayer-js";
import * as chains from "genlayer-js/chains";

console.log("genlayer-js exports:\n", Object.keys(sdk).sort());
console.log("\ngenlayer-js/chains exports:\n", Object.keys(chains).sort());

try {
  const types = await import("genlayer-js/types");
  console.log("\ngenlayer-js/types exports:\n", Object.keys(types).sort());
} catch (e) {
  console.log("\nno genlayer-js/types subpath:", e.message);
}
