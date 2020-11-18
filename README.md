# China Regions Data

最新最全的中国统计用区划代码和城乡划分代码，包含中国省、地、县、乡、村列表信息（不包含港、澳、台地区）。

统计用区划代码和城乡划分代码的区划范围，是国家统计局开展统计调查的区划范围。***未包括我国台湾省、香港特别行政区、澳门特别行政区***。

您可以使用脚本自行爬取最新数据，也可以直接到 Release 下载已爬取的数据。

**使用脚本自行爬取时支持断点续传！**

## 使用说明

1. 安装 Node.JS
   * 版本要求至少 10.12，建议安装最新的 [LTS 版本](https://nodejs.org/en/download/)或[稳定版本](https://nodejs.org/en/download/current/)
2. clone 本项目仓库，或者直接下载 `main.js` 和 `package.json` 两个文件到一个独立的文件夹中。
3. 进入项目目录，运行 `npm install` 安装项目依赖（项目只有一个依赖项）
   * 如果您使用 Yarnpkg，也可以直接运行 `yarn`
4. 编辑 `main.js` 最开头的 `配置 Configuration` 部分，[配置说明](#配置说明)。
5. 运行 `node main.js` 开始爬取任务。

> 若由于网络问题，导致爬取失败，程序会自动进行重试，重试 10 次失败程序将会退出。
>
> 您可以直接重复第 5 步来实现断点续传。

## 配置说明

|配置项|类型|说明|
|:---:|:---:|:---:|
|SCHEMA|'http' \| 'https'|请求协议（网站仅支持 'http'）|
|DOMAIN|string|请求的网站域名|
|PATH|string|请求的数据根路径|
|YEAR|number|爬取年份|
|LEVEL|Array&lt;'province' \| 'city' \| 'county' \| 'town' \| 'village'&gt;|爬取层级|
|DNS_TYPE|'A' \| 'AAAA'|解析 IPv4（'A'）还是 IPv6（'AAAA'）<br>使用 IPv6 前请先确认你已接入 IPv6 网络|
|DNS_SERVER|string|用于解析域名使用的 DNS 服务|
|TIMEOUT|number|超时时间，不宜太短也不宜太长<br>太短会导致频繁超时，影响爬取速度<br>太长会出现 Socket Hang Up 时影响爬取速度|
|RETRY|number|单个请求失败自动重试次数|
|SAVE_PATH|string|文件保存路径|

## 本项目生成数据格式

本项目脚本生成的结果数据以 JSON 格式进行存储，JSON 数据最外层为一个数组，数组成员为各个省的数据。

> 从 2019 年的数据开始，部分省份缺少县级（county）层级，而直接从地级（city）下划分乡级（town）。
>
> 针对这种情况，为保证数据结构的完整性，缺失的层级将会保留，`name` 固定为 `"-"`，`id` 固定为上一级的 `id`。

### 省级数据

| 属性 |  类型  |   说明   |
|:-----|:------:|:--------:|
| name | string |   名称   |
|  id  | number | 省级代码 |
| children | Array&lt;[object](#地级数据)&gt;? | 地级数据 |

> 省级代码为 2 位数。

样例数据：
<details><pre><code>
[
  {
    "name": "北京市",
    "id": 11
  },
  ......
]
</code></pre></details>

### 地级数据

| 属性 |  类型  |   说明   |
|:-----|:------:|:--------:|
| name | string |   名称   |
|  id  | number | 地级代码 |
| children | Array&lt;[object](#县级数据)&gt;? | 县级数据 |

> 地级代码为 4 位数，包含前 2 位为省级代码。

样例数据：
<details><pre><code>
[
  {
    "name": "北京市",
    "id": 11,
    "children": [
      {
        "name": "市辖区",
        "id": 1101
      },
      ......
    ]
  },
  ......
]
</code></pre></details>

### 县级数据

| 属性 |  类型  |   说明   |
|:-----|:------:|:--------:|
| name | string |   名称   |
|  id  | number | 县级代码 |
| children | Array&lt;[object](#乡级数据)&gt;? | 乡级数据 |

> 县级代码为 6 位数，包含前 4 位为地级代码。

样例数据：
<details><pre><code>
[
  {
    "name": "北京市",
    "id": 11,
    "children": [
      {
        "name": "市辖区",
        "id": 1101,
        "children": [
          {
            "name": "东城区",
            "id": 110101
          },
          ......
        ]
      },
      ......
    ]
  },
  ......
]
</code></pre></details>

### 乡级数据

| 属性 |  类型  |   说明   |
|:-----|:------:|:--------:|
| name | string |   名称   |
|  id  | number | 乡级代码 |
| children | Array&lt;[object](#村级数据)&gt;? | 村级数据 |

> 乡级代码为 9 位数，包含前 6 位为县级代码。

样例数据：
<details><pre><code>
[
  {
    "name": "北京市",
    "id": 11,
    "children": [
      {
        "name": "市辖区",
        "id": 1101,
        "children": [
          {
            "name": "东城区",
            "id": 110101,
            "children": [
              {
                "name": "东华门街道办事处",
                "id": 110101001
              },
              ......
            ]
          },
          ......
        ]
      },
      ......
    ]
  },
  ......
]
</code></pre></details>

### 村级数据

| 属性 |  类型  |   说明   |
|:-----|:------:|:--------:|
| name | string | 名称 |
| id | number | 村级代码 |
| type | number | 城乡分类代码 |

> 村级代码为 12 位数，包含前 9 位为乡级代码。
>
> 城乡分类代码为 3 位数。

样例数据：
<details><pre><code>
[
  {
    "name": "北京市",
    "id": 11,
    "children": [
      {
        "name": "市辖区",
        "id": 1101,
        "children": [
          {
            "name": "东城区",
            "id": 110101,
            "children": [
              {
                "name": "东华门街道办事处",
                "id": 110101001,
                "children": [
                  {
                    "name": "多福巷社区居委会",
                    "id": 110101001001,
                    "type": 111
                  },
                  ......
                ]
              },
              ......
            ]
          },
          ......
        ]
      },
      ......
    ]
  },
  ......
]
</code></pre></details>

## 统计用区划代码和城乡划分代码结构

[参考文章](http://www.stats.gov.cn/tjsj/tjbz/200911/t20091125_8667.html)

统计用区划代码和城乡划分代码分为两段 17 位，其代码结构为：

<ruby><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd><kbd>5</kbd><kbd>6</kbd><kbd>7</kbd><kbd>8</kbd><kbd>9</kbd><kbd>10</kbd><kbd>11</kbd><kbd>12</kbd><rt>统计用区划代码</rt></ruby> - <ruby><kbd>13</kbd><kbd>14</kbd><kbd>15</kbd><kbd>16</kbd><kbd>17</kbd><rt>城乡划分代码</rt></ruby>

- 统计用区划代码
  - <kbd>1</kbd><kbd>2</kbd>：省级代码
  - <kbd>3</kbd><kbd>4</kbd>：地级代码
  - <kbd>5</kbd><kbd>6</kbd>：县级代码
  - <kbd>7</kbd><kbd>8</kbd><kbd>9</kbd>：乡级代码
    - 001～099：街道
    - 100～199：镇
    - 200～399：乡
    - 400～599：类似乡级单位
  - <kbd>10</kbd><kbd>11</kbd><kbd>12</kbd>：村级代码
    - 001～199：居民委员会
    - 200～399：村民委员会
    - 400～497, 499：类似居民委员会
    - 498：在街道、镇以及类似乡级单位的开发区、科技园区、工业园区、工矿区、高校园区、科研机构园区等区域下，当乡级单位下未设（或未明确）村级单位时，设立的一个虚拟村级单位，名称为“××虚拟社区”
    - 500～597, 599：类似村民委员会
    - 598：在乡以及类似乡级单位的农、林、牧、渔场和其他农业活动区域下，当乡级单位下未设（或未明确）村级单位时，设立的一个虚拟村级单位，名称为“××虚拟生活区”
- 城乡划分代码
  - <kbd>13</kbd><kbd>14</kbd>：城乡属性代码 **本项目获取的数据中不包含此数据**
  - <kbd>15</kbd><kbd>16</kbd><kbd>17</kbd>：城乡分类代码
    - 111：主城区
    - 112：城乡结合区
    - 121：镇中心区
    - 122：镇乡结合区
    - 123：特殊区域
    - 210：乡中心区
    - 220：村庄
