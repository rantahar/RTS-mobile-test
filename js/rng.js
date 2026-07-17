// Seeded pseudo-random number generator (mulberry32). Deterministic: the same
// seed always yields the same stream, so a map seed reproduces a map exactly
// and tests stay repeatable. DOM-free; classic script, attaches RNG to scope.
//
//   const rng = RNG.create(1234);
//   rng.float()        -> [0, 1)
//   rng.float(a, b)    -> [a, b)
//   rng.int(a, b)      -> integer in [a, b] (inclusive)
//   rng.range(n)       -> integer in [0, n)
//   rng.pick(arr)      -> a random element
//   rng.chance(p)      -> true with probability p
const RNG = {
  create(seed) {
    let a = (seed >>> 0) || 1; // 0 would freeze mulberry32; nudge to 1
    const next = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      float: (min = 0, max = 1) => min + (max - min) * next(),
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      range: (n) => Math.floor(next() * n),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      raw: next,
    };
  },
};
