import muscleDiagramSvg from '/muscle-diagram.svg?raw'

export function buildMuscleDiagramHtml(viewBox: string): string {
  return muscleDiagramSvg
    .replace(
      /<svg[^>]*>/,
      `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`,
    )
    .replace(/\s*width="100%"/, '')
    .trim()
}

export const MUSCLE_DIAGRAM_FRONT_HTML = buildMuscleDiagramHtml('0 0 340 520')
export const MUSCLE_DIAGRAM_BACK_HTML = buildMuscleDiagramHtml('340 0 340 520')
