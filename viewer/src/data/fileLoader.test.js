import { describe, it, expect } from 'vitest'
import { parseStageIndex, sortStageFiles } from './fileLoader.js'

describe('parseStageIndex', () => {
  it('parses leading number from stage filenames', () => {
    expect(parseStageIndex('01_SanityPreprocess.json')).toBe(1)
    expect(parseStageIndex('13_FinalValidation.json')).toBe(13)
    expect(parseStageIndex('09_GroupConnect.json')).toBe(9)
  })

  it('returns Infinity for filenames without leading number', () => {
    expect(parseStageIndex('config.json')).toBe(Infinity)
    expect(parseStageIndex('README.md')).toBe(Infinity)
  })
})

describe('sortStageFiles', () => {
  it('sorts File objects by filename prefix number ascending', () => {
    const makeFile = (name) => ({ name })
    const files = [
      makeFile('13_FinalValidation.json'),
      makeFile('01_SanityPreprocess.json'),
      makeFile('07_ExtendToIntersect.json'),
      makeFile('02_Meshing.json'),
    ]
    const sorted = sortStageFiles(files)
    expect(sorted.map(f => f.name)).toEqual([
      '01_SanityPreprocess.json',
      '02_Meshing.json',
      '07_ExtendToIntersect.json',
      '13_FinalValidation.json',
    ])
  })

  it('does not mutate the original array', () => {
    const makeFile = (name) => ({ name })
    const files = [makeFile('02.json'), makeFile('01.json')]
    const original = [...files]
    sortStageFiles(files)
    expect(files[0].name).toBe(original[0].name)
  })
})
