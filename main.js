const { Resolver } = require('dns');
const fs = require('fs');
const path = require('path');
const util = require('util');
const jsdom = require('jsdom');

// 开始运行计时
console.time('Info');

const fsAccess = util.promisify(fs.access);
const fsMkdir = util.promisify(fs.mkdir);

const SCHEMA = 'http';
const DOMAIN = 'www.stats.gov.cn';  // 国家统计局
const PATH = '/tjsj/tjbz/tjyqhdmhcxhfdm';  // 统计数据 / 统计标准 / 统计用区划代码和城乡划分代码
const YEAR = 2018;  // 更新于 2019-01-31
// const LEVEL = ['province'];  // 爬取层级，省，结果大约 1K，耗时 1 秒左右
// const LEVEL = ['province', 'city'];  // 爬取层级，市，结果大约 12K，耗时 2 秒左右
// const LEVEL = ['province', 'city', 'county'];  // 爬取层级，区，结果大约 128K，耗时 15 秒左右
const LEVEL = ['province', 'city', 'county', 'town'];  // 爬取层级，街道，结果大约 1.8M，耗时 3.5 分钟左右
// const LEVEL = ['province', 'city', 'county', 'town', 'village'];  // 爬取层级，居委会，结果大约 40M，耗时 30 分钟左右
const DNS_TYPE = 'A';  // 使用 IPv4 请求
// const DNS_TYPE = 'AAAA';  // 使用 IPv6 请求
// const DNS_SERVER = '8.8.8.8';  // Google 公共 IPv4 DNS 服务
const DNS_SERVER = '114.114.114.114';  // 114 公共 IPv4 DNS 服务
// const DNS_SERVER = '2001:4860:4860::8888';  // Google 公共 IPv6 DNS 服务
const TIMEOUT = 5e3;  // 5 秒
const RETRY = 10;  // 单个请求失败自动重试次数
const SAVE_PATH = path.join(__dirname, `data-${YEAR}.json`);  // 存储路径

const request = SCHEMA === 'http' ? require('http') : require('https');
const DateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour12: false, weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

let progress = '0.0000';
const log = (...args) => console.timeLog('Info', util.inspect(DateTimeFormatter.format(), { colors: true }), `${progress}%`, ...args);
const error = (...args) => console.trace(util.inspect(DateTimeFormatter.format(), { colors: true }), `${progress}%`, ...args);

const requestAgent = new request.Agent({
  keepAlive: true,
  timeout: TIMEOUT,
});

/**
 * GET 请求指定路径，路径前缀固定
 * @param {string} IP
 * @param {string} urlPath
 *
 * @returns {Promise<jsdom.DOMWindow>}
 */
const fetchPath = async (IP, urlPath) => new Promise((resolve, reject) => {
  const getPath = [PATH, YEAR, urlPath].join('/');
  const url = `${SCHEMA}://${DOMAIN}${getPath}`;
  log(`GET: ${url}`);
  const req = request.get({
    host: IP,
    path: getPath,
    headers: { host: DOMAIN },
    agent: requestAgent,
    timeout: TIMEOUT,
    setHost: false,
  }, response => {
    if (response.statusCode >= 400) {
      reject(new Error(`请求出错，状态码：${response.statusCode}`));
      return;
    }
    const body = [];
    response.on('data', chunk => body.push(chunk));
    response.on('end', () => {
      const buf = Buffer.concat(body);
      if (buf.length === 0) {
        reject(new Error('请求出错，数据长度为 0！'));
        return;
      }
      resolve(new jsdom.JSDOM(buf, {
        url,
        contentType: response.headers['content-type'],
      }).window);
    });
    response.on('error', err => reject(new Error(`请求出错，${err}`)));
  });
  req.on('error', err => reject(new Error(`请求出错，${err}`)));
  req.setTimeout(TIMEOUT, req.destroy);
});

/**
 * 解析域名到 IP 地址
 */
const resolveDNS = () => {
  log(`解析域名......（DNS Server: ${DNS_SERVER} TYPE: ${DNS_TYPE}）`);
  const dns = new Resolver();
  dns.setServers([DNS_SERVER]);
  return new Promise(resolve => {
    dns.resolve(DOMAIN, DNS_TYPE, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        error(`无法使用 DNS 服务（${DNS_SERVER}）解析域名 ${DOMAIN}`);
        process.exit(-1);
        return;
      }
      log(`域名解析结果：${DOMAIN} => ${addresses}`);
      resolve(addresses[0]);
    });
  });
};

/**
 * @param {fs.ReadStream} stream
 *
 * @yields {string}
 */
async function* readToNextBracket(stream) {
  const END = 'end';
  const READABLE = 'readable';
  const endPromise = new Promise(resolve => stream.once(END, () => resolve(END)));
  let lastOne = '';
  while(true) {
    const result = await Promise.race([
      new Promise(resolve => stream.once(READABLE, () => resolve(READABLE))),
      endPromise,
    ]);
    if (result === END) {
      return lastOne;
    }
    let data;
    while(data = stream.read()) {
      data = `${lastOne}${data}`;
      lastOne = '';
      const parts = data.split(/(?=[[{}\]])/);
      if (parts.length) {
        lastOne = parts.pop();
      }
      yield* parts;
    }
  }
}

const textEncoder = new util.TextEncoder();

/**
 * @returns {Promise<[number[][], number]>}
 */
const getDoneJobs = async () => {
  log('尝试恢复任务进度......');
  const read = fs.createReadStream(SAVE_PATH, {
    flags: 'a+',  // 以 读/追加 模式打开，文件不存在时创建,
    encoding: 'utf8',
    mode: 0o644,
    autoClose: true,
  });
  const stack = [];
  let [readPosition, position] = [0, [0]];
  let list;
  for await (const str of readToNextBracket(read)) {
    const [bracket, data] = [str.substr(0, 1), str.substr(1)];
    if (bracket === '[') {
      const lastList = list;
      list = [];
      stack.push({ bracket, list, lastList });
    } else if (bracket === '{') {
      const id = data.match(/"id":(\d+)/);
      if (!(id && list)) break;
      stack.push({ bracket });
      list.push(Number(id[1]));
    } else if (bracket === '}') {
      const obj = stack.pop();
      if (obj.bracket !== '{') break;
    } else if (bracket === ']') {
      const obj = stack.pop();
      if (obj.bracket !== '[') break;
      list = obj.lastList;
    } else break;
    if (bracket === '{') {
      if (list.length === 2) {
        position.push(readPosition - 1);
      } else if (list.length > 2) {
        const last = position.pop();
        position.pop()
        position.push(last);
        position.push(readPosition - 1);
      }
    } else if (bracket === '}') {
      position.pop();
      position.push(readPosition + 1);
    } else if (bracket === ']') {
      position.pop();
      if (list && list.length >= 2) {
        position.pop();
      }
    }
    readPosition += textEncoder.encode(str).length;
    if (bracket === '[') {
      position.push(readPosition);
    }
  }
  read.close();
  if (stack.length && stack[stack.length - 1].bracket === '{') {
    stack.pop();
    list.pop();
  }
  const doneJob = stack.reduce((arr, obj) => {
    if (obj.bracket === '[') {
      arr.push(obj.list);
    }
    return arr;
  }, []);
  return [doneJob, position.pop()];
};

/**
 * @typedef Job
 * @type {Object}
 * @property {string} name
 * @property {number} id
 * @property {number} [type]
 * @property {string} [url]
 * @property {Jobs}   [children]
 * @typedef {Job[]} Jobs
 */

/**
 * 获取子节点列表
 * @param {string} IP
 * @param {number} index
 * @param {string=} jobId
 * @param {string=} id
 *
 * @returns {Promise<Jobs>}
 */
const getChildren = async (IP, index, jobId = '', id = '') => {
  const p = [];
  for (let i = 0; i < jobId.length; i += 2) {
    p.push(jobId.substr(i, 2));
  }
  p.push(`${id || 'index'}.html`);
  const urlPath = p.join('/');
  let window;
  let retry = RETRY;
  while (retry--) {
    try {
      window = await fetchPath(IP, urlPath);
      break;
    } catch(e) {
      error(e);
      log(`重试（${retry}）......`);
    }
  }
  const results = [];
  for (const tr of window.document.querySelectorAll(`.${LEVEL[index]}tr`)) {
    if (index === 0) {
      // Province
      for (const td of tr.querySelectorAll('td')) {
        const a = td.querySelector('a');
        results.push({
          name: a.textContent.trim(),
          id: parseInt(path.basename(a.href)),  // '11.html' can parse to 11
          url: a.href,
        });
      }
    } else {
      const td = tr.querySelectorAll('td');
      if (td.length === 2) {
        const a = td[1].querySelector('a');
        if (a) {
          results.push({
            name: a.textContent.trim(),
            id: parseInt(path.basename(a.href)),  // '11.html' can parse to 11
            url: a.href,
          });
        } else {
          results.push({
            name: td[1].textContent.trim(),
            id: parseInt(td[0].textContent.trim().substr(0, (index + 1) * 2)),
          });
        }
      } else if (td.length === 3) {
        // Village
        results.push({
          name: td[2].textContent.trim(),
          id: parseInt(td[0].textContent.trim()),
          type: parseInt(td[1].textContent.trim()),
        });
      }
    }
  }
  return results;
};

/**
 *
 * @param {Jobs} jobs
 * @param {number[][]} doneJob
 * @param {number} index
 * @param {function(data)} write
 * @param {string} IP
 * @param {string=} jobId
 * @param {[number, number]=} progressRatio
 */
const doJob = async (jobs, doneJob, index, write, IP, jobId = '', progressRatio = [0, 100]) => {
  if (index >= LEVEL.length) {
    return;
  }
  const hasChildren = index < LEVEL.length - 1;
  let progressIndex = 0;
  for (const job of jobs) {
    if (doneJob[index] && doneJob[index][doneJob[index].length - 1] === job.id) {
      if (!doneJob[index + 1]) {
        // 当前任务已完成
        ++progressIndex;
        continue;
      }
    } else if (doneJob[index] && doneJob[index].includes(job.id)) {
      // 当前任务已完成
      ++progressIndex;
      continue;
    } else {
      // 已写出当前节点
      const comma = job === jobs[0] ? '' : ',';
      const type = job.type ? `,"type":${job.type}` : '';
      const children = (hasChildren && job.url) ? `,"children":[` : '';
      await write(`${comma}{"name":"${job.name}","id":${job.id}${type}${children}`);
    }
    // 进入下一级节点
    if (hasChildren && job.url) {
      job.children = await getChildren(IP, index + 1, jobId, job.id.toString(10));
      await doJob(job.children, doneJob, index + 1, write, IP, job.id.toString(10), [
        progressIndex / jobs.length * progressRatio[1] + progressRatio[0],
        progressRatio[1] / jobs.length,
      ]);
    }
    await write('}');
    progress = (++progressIndex / jobs.length * progressRatio[1] + progressRatio[0]).toFixed(4);
  }
  await write(']');
};

(async () => {
  // 解析一次域名，防止重复进行 DNS 解析
  const IP = await resolveDNS();
  // 检查存储路径是否存在
  const dir = path.dirname(SAVE_PATH);
  try {
    await fsAccess(dir, fs.constants.F_OK);
  } catch {
    // 存储路径不存在，创建目录
    await fsMkdir(dir, { recursive: true, mode: 0o755 });
  }
  const [doneJob, position] = await getDoneJobs();
  if (doneJob.length === 0 && position > 0) {
    progress = '100.0000';
    log('任务完成！');
    return;
  }
  const jobs = await getChildren(IP, 0);
  const writeStream = fs.createWriteStream(SAVE_PATH, {
    flags: 'r+',
    encoding: 'utf8',
    mode: 0o644,
    autoClose: true,
    start: position,
  });
  const write = async chunk => new Promise(resolve => {
    const ret = writeStream.write(chunk, 'utf8', err => {
      if (err) {
        error(`写出出错！${err}`);
      }
    });
    if (ret) {
      process.nextTick(resolve);
    } else {
      writeStream.once('drain', resolve);
    }
  });
  if (position === 0) {
    await write('[');
  }
  await doJob(jobs, doneJob, 0, write, IP);
  writeStream.close();
  log('任务完成！');
})().catch(e => {
  error(e);
}).finally(async () => {
  // 结束运行计时
  console.timeEnd('Info');
});
