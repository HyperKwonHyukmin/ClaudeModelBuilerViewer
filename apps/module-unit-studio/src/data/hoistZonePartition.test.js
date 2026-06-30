import { describe, it, expect } from 'vitest'
import { partitionZones, assignNodesToZones } from './hoistZonePartition.js'

const bbox = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 }

describe('partitionZones', () => {
  it('bandAxis=y, bands=[1,2] → 행1 전폭 + 행2 좌/우 = 3구역', () => {
    const z = partitionZones(bbox, { bandAxis: 'y', bands: [1, 2] })
    expect(z).toHaveLength(3)
    expect(z[0]).toMatchObject({ xMin: 0, xMax: 100, yMin: 0, yMax: 50 })
    expect(z[1]).toMatchObject({ xMin: 0, xMax: 50, yMin: 50, yMax: 100 })
    expect(z[2]).toMatchObject({ xMin: 50, xMax: 100, yMin: 50, yMax: 100 })
  })

  it('bands=[2,2] → 2x2 = 4구역', () => {
    expect(partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })).toHaveLength(4)
  })

  it('bandAxis=x, bands=[1,2] → 열 분할(대칭)', () => {
    const z = partitionZones(bbox, { bandAxis: 'x', bands: [1, 2] })
    expect(z).toHaveLength(3)
    expect(z[0]).toMatchObject({ xMin: 0, xMax: 50, yMin: 0, yMax: 100 })
    expect(z[1]).toMatchObject({ xMin: 50, xMax: 100, yMin: 0, yMax: 50 })
    expect(z[2]).toMatchObject({ xMin: 50, xMax: 100, yMin: 50, yMax: 100 })
  })
})

describe('assignNodesToZones', () => {
  it('노드를 XY 위치로 셀에 배정, 경계는 하한 셀', () => {
    const zones = partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })
    const entries = [
      [1, { x: 10, y: 10, z: 0 }],
      [2, { x: 90, y: 90, z: 0 }],
      [3, { x: 50, y: 10, z: 0 }],
      [4, { x: 100, y: 100, z: 0 }],
    ]
    const map = assignNodesToZones(zones, entries)
    const total = [...map.values()].reduce((n, a) => n + a.length, 0)
    expect(total).toBe(4)
    const rightLowerCell = zones.find(z => z.xMin === 50 && z.yMax === 50)
    expect(map.get(rightLowerCell.id).some(nd => nd.id === 3)).toBe(false)
    expect(entries.length).toBe(4)
  })
})
