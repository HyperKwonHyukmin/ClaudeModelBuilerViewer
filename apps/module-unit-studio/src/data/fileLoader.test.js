import { describe, it, expect } from 'vitest'
import { loadFiles, parseStageIndex, sortStageFiles } from './fileLoader.js'

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

describe('loadFiles', () => {
  it('loads a phase JSON together with a WorkBench COG JSON', async () => {
    const makeJsonFile = (name, json) => ({
      name,
      text: async () => JSON.stringify(json),
    })
    const stageJson = {
      meta: { stageName: 'BdfImport', stageIndex: 0, unit: 'mm' },
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 1000, y: 0, z: 0 },
      ],
      elements: [
        { id: 10, type: 'BEAM', category: 'Structure', startNode: 1, endNode: 2 },
      ],
    }
    const cogJson = {
      BdfFilePath: 'C:\\model.bdf',
      TotalMass: 102.56637667083082,
      CogX: 84979.76152546985,
      CogY: 4923.258388981761,
      CogZ: 38686.611870460925,
      ResultFilePath: '',
    }

    const result = await loadFiles([
      makeJsonFile('3454-35020-A505080_20251021.json', stageJson),
      makeJsonFile('3454-35020-A505080_20251021_COG.json', cogJson),
    ])

    expect(result.stages).toHaveLength(1)
    expect(result.summary.loaded).toBe(1)
    expect(result.summary.skipped).toBe(0)
    expect(result.stageSummary?.massProperties).toEqual({
      totalMassTon: 102.56637667083082,
      beamMassTon: 102.56637667083082,
      pointMassTon: 0,
      centerOfGravityMm: {
        x: 84979.76152546985,
        y: 4923.258388981761,
        z: 38686.611870460925,
      },
    })
  })

  it('생성자가 throw 하는 손상 phase 파일 1개가 나머지 파일 로드를 막지 않는다', async () => {
    const makeJsonFile = (name, json) => ({
      name,
      text: async () => JSON.stringify(json),
    })
    const goodJson = {
      meta: { stageName: 'Good', stageIndex: 1, unit: 'mm' },
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 1000, y: 0, z: 0 },
      ],
      elements: [
        { id: 10, type: 'BEAM', category: 'Structure', startNode: 1, endNode: 2 },
      ],
    }
    // isPhaseStageJson 은 true(nodes/elements 배열) 지만 nodes 에 null 이 있어
    // StageData 생성자의 `nodeMap.set(n.id, ...)` 가 TypeError 로 throw 한다.
    const brokenJson = {
      meta: { stageName: 'Broken', stageIndex: 2, unit: 'mm' },
      nodes: [null],
      elements: [],
    }

    const result = await loadFiles([
      makeJsonFile('01_Good.json', goodJson),
      makeJsonFile('02_Broken.json', brokenJson),
    ])

    // 정상 파일은 로드되고, 실패 파일만 failedFiles 에 남는다
    expect(result.stages).toHaveLength(1)
    expect(result.summary.loaded).toBe(1)
    expect(result.summary.failed).toBe(1)
    expect(result.summary.failedFiles).toContain('02_Broken.json')
    expect(result.summary.failedFiles).not.toContain('01_Good.json')
  })

  it('uses posture JSON mass properties when no separate COG JSON exists', async () => {
    const makeJsonFile = (name, json) => ({
      name,
      text: async () => JSON.stringify(json),
    })
    const stageJson = {
      meta: { stageName: 'BdfImport', stageIndex: 0, unit: 'mm' },
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }],
      elements: [],
    }
    const postureJson = {
      schema: 'posture-stability/1.0',
      sourceFile: 'model.json',
      model: {
        unit: 'mm',
        totalMassTon: 31.81972528879429,
        centerOfGravityMm: {
          x: 84545.3042571815,
          y: 4996.691568459954,
          z: 38817.542637970706,
        },
        massSource: 'computed:beam+pointMass',
      },
    }

    const result = await loadFiles([
      makeJsonFile('model.json', stageJson),
      makeJsonFile('model_posture.json', postureJson),
    ])

    expect(result.stages).toHaveLength(1)
    expect(result.summary.skipped).toBe(0)
    expect(result.stageSummary?.massProperties.centerOfGravityMm).toEqual({
      x: 84545.3042571815,
      y: 4996.691568459954,
      z: 38817.542637970706,
    })
  })
})
