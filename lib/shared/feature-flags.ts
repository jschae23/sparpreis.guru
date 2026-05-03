export function isUrlaubsfinderEnabled(): boolean {
  return process.env.ENABLE_URLAUBSFINDER?.toLowerCase() !== "false"
}
