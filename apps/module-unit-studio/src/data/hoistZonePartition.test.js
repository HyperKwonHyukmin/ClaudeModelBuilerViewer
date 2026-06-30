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
    const z = partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })
    expect(z).toHaveLength(4)
    const bottomLeft = z.find(c => c.xMin === 0 && c.xMax === 50 && c.yMin === 0 && c.yMax === 50)
    const topRight = z.find(c => c.xMin === 50 && c.xMax === 100 && c.yMin === 50 && c.yMax === 100)
    expect(bottomLeft).toMatchObject({ xMin: 0, xMax: 50, yMin: 0, yMax: 50 })
    expect(topRight).toMatchObject({ xMin: 50, xMax: 100, yMin: 50, yMax: 100 })
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
    // 경계 노드(id 3, x=50)는 좌하단 셀로 배정(하한 셀 우선)
    const leftLowerCell = zones.find(z => z.xMin === 0 && z.xMax === 50 && z.yMax === 50)
    expect(map.get(leftLowerCell.id).some(nd => nd.id === 3)).toBe(true)
    // 전역 최대 노드(id 4, 100,100)는 우상단 셀로 배정
    const topRightCell = zones.find(z => z.xMin === 50 && z.yMin === 50)
    expect(map.get(topRightCell.id).some(nd => nd.id === 4)).toBe(true)
  })

  it('non-finite x/y(NaN/null/Infinity) 노드는 배정에서 제외', () => {
    const zones = partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })
    const entries = [
      [1, { x: 10, y: 10, z: 0 }],
      [2, { x: NaN, y: 20, z: 0 }],
      [3, null],
      [4, { x: 30, y: Infinity, z: 0 }],
    ]
    const map = assignNodesToZones(zones, entries)
    const total = [...map.values()].reduce((n, a) => n + a.length, 0)
    expect(total).toBe(1)
    const assigned = [...map.values()].flat()
    expect(assigned.map(nd => nd.id)).toEqual([1])
  })
})
