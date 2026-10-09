// Two distinct items chosen uniformly at random (partial Fisher-Yates).
export function pickTwoRandom<T>(items: T[]): [T, T] {
  const pool = [...items]
  const pick = (): T => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!
  return [pick(), pick()]
}
