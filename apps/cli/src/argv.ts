export function normalizeArgv(argv: readonly string[]): string[] {
  return argv[2] === '--' ? [...argv.slice(0, 2), ...argv.slice(3)] : [...argv];
}
