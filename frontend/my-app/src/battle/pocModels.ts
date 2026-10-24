const paths: Record<string, string> = {
  pikachu: '/models/poc/pikachu.glb',
  salameche: '/models/poc/charmander.glb',
  charmander: '/models/poc/charmander.glb',
}

export function pocModelPath(species: string): string | null {
  const key = species.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return paths[key] ?? null
}
