import { describe, expect, test } from 'bun:test'
import { buildDocumentGroundingSupports } from './messageUtils'

describe('buildDocumentGroundingSupports', () => {
  test('keeps the strongest matched document citations for a segment', () => {
    const content = 'DNS解析器已经将IP地址返回给您的计算机，浏览器开始建立连接并获取网页内容。'
    const sources = [
      {
        title: 'Doc A',
        titlePath: ['第一章'],
        snippet: 'DNS解析器已经将IP地址返回给您的计算机。',
      },
      {
        title: 'Doc B',
        titlePath: ['第二章'],
        snippet: '浏览器开始建立连接并获取网页内容。',
      },
      {
        title: 'Doc C',
        titlePath: ['第三章'],
        snippet: 'DNS解析器已经将IP地址返回给您的计算机，浏览器开始建立连接。',
      },
      {
        title: 'Doc D',
        titlePath: ['第四章'],
        snippet: '浏览器缓存策略和强缓存协商缓存。',
      },
    ]

    const supports = buildDocumentGroundingSupports(content, sources)

    expect(supports).toHaveLength(1)
    expect(supports[0].citations.map(item => item.index)).toEqual([2, 0, 1])
  })

  test('does not pull in sources that only share generic title path tokens', () => {
    const content = '本地DNS解析器已经将IP地址返回给您的计算机，浏览器随后建立连接。'
    const sources = [
      {
        title: '代码随想录最强八股文第五版（计算机基础篇）.pdf',
        titlePath: ['8. 浏览器发起连接'],
        snippet: '本地DNS解析器已经将IP地址返回给您的计算机，浏览器随后建立连接。',
      },
      {
        title: '代码随想录最强八股文第五版（计算机基础篇）.pdf',
        titlePath: ['8. 浏览器发起连接'],
        snippet: '递归查询和迭代查询是DNS解析过程中用于获取域名解析信息的两种方法。',
      },
      {
        title: '代码随想录最强八股文第五版（计算机基础篇）.pdf',
        titlePath: ['8. 浏览器发起连接'],
        snippet: 'TCP三次握手用于建立可靠连接。',
      },
    ]

    const supports = buildDocumentGroundingSupports(content, sources)

    expect(supports).toHaveLength(1)
    expect(supports[0].citations.map(item => item.index)).toEqual([0])
  })
})
