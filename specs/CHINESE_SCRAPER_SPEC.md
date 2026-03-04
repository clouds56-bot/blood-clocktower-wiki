## Spec: Chinese Wiki Scraper

### Requirements
- Scrape character data from the official Chinese Blood on the Clocktower wiki (clocktower-wiki.gstonegames.com)
- Extract Chinese translations for name, ability, flavor text, tips, examples, and how-to-run
- Merge Chinese data into existing English character JSON files
- Support caching for faster re-scraping

### Data Structure to Extract
Each character page contains:
- `name.cn` - Chinese name (from page title)
- `ability.cn` - 角色能力 (Character Ability section)
- `flavor_text.cn` - 背景故事 (Background Story section)
- `tips.cn` - 提示与技巧 (Tips & Tricks section)
- `examples.cn` - 范例 (Examples section)
- `how_to_run.cn` - 运作方式 (How to Run section)
- Edition info - 所属剧本 (Edition/Script info)

### URL Mapping
The Chinese wiki uses URL-encoded Chinese names:
- Base: `https://clocktower-wiki.gstonegames.com/index.php?title={url_param}`
- Example: `https://clocktower-wiki.gstonegames.com/index.php?title=厨师`

### Character Mapping
Create `config/character-mapping.json` with structure:
```json
{
  "chef": {
    "cn": "厨师",
    "url_param": "厨师"
  },
  "washerwoman": {
    "cn": "洗衣妇",
    "url_param": "洗衣妇"
  },
  ...
}
```

**Mapping Strategy:**
1. Initially create mapping for all 138 characters manually
2. Each character page contains "英文名：{name}" which can be used for verification
3. URL params are the Chinese names as they appear in URLs

### Page Structure (Chinese Wiki)
Character pages have these sections:
- `## 背景故事` (Background Story)
- `## 角色能力` (Character Ability)
- `## 范例` (Examples)
- `## 运作方式` (How to Run)
- `## 提示与技巧` (Tips & Tricks)
- `角色信息` section containing:
  - 英文名 (English Name)
  - 所属剧本 (Edition/Script)

### Caching
- Directory: `.cache/html-cn/`
- Filename: `{url_param}.html` (using URL component as filename)
- Example: `厨师.html`

### Implementation

#### Files to Create
1. `config/character-mapping.json` - Maps English IDs to Chinese data
2. `scripts/scrape-chinese-wiki.js` - Main scraper

#### Scraper Logic
```javascript
const BASE_URL = 'https://clocktower-wiki.gstonegames.com/index.php?title';

async function scrapeChineseCharacter(englishId) {
  const mapping = loadMapping()[englishId];
  const url = `${BASE_URL}=${encodeURIComponent(mapping.url_param)}`;
  const cacheFile = `.cache/html-cn/${mapping.url_param}.html`;

  // Fetch with caching
  const html = await fetchWithCache(url, cacheFile);

  // Parse with cheerio
  const $ = cheerio.load(html);

  // Extract data
  return {
    name: { cn: $('h1').first().text().trim() },
    ability: { cn: extractSection($, '角色能力') },
    flavor_text: { cn: extractSection($, '背景故事') },
    examples: { cn: extractExamples($) },
    tips: { cn: extractTips($) },
    how_to_run: { cn: extractSection($, '运作方式') }
  };
}

function extractSection($, heading) {
  const header = $(`h2:contains("${heading}")`).first();
  const section = header.nextUntil('h2').first();
  return section.length ? section.text().trim() : null;
}
```

#### Merge Strategy
```javascript
async function mergeChineseData(englishId, chineseData) {
  const jsonPath = `characters/${type}/${englishId}.json`;
  const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Merge Chinese data
  if (chineseData.name.cn) existing.name.cn = chineseData.name.cn;
  if (chineseData.ability.cn) existing.ability.cn = chineseData.ability.cn;
  if (chineseData.flavor_text.cn) existing.flavor_text.cn = chineseData.flavor_text.cn;
  if (chineseData.tips.cn) existing.tips.cn = chineseData.tips.cn;
  if (chineseData.examples.cn) existing.examples.cn = chineseData.examples.cn;
  if (chineseData.how_to_run.cn) existing.how_to_run.cn = chineseData.how_to_run.cn;

  // Save
  fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2));
}
```

### Edition Mapping
Chinese editions:
- 暗流涌动 → trouble_brewing
- 黯月初升 → bad_moon_rising
- 梦殒春宵 → sects_violets
- 实验性角色 → experimental
- 华灯初上 → 华灯初上 (Chinese-only edition)

### Character Lists by Type
Based on Chinese wiki category pages:

**Townsfolk (镇民):**
- 暗流涌动: 洗衣妇, 图书管理员, 调查员, 厨师, 共情者, 占卜师, 送葬者, 僧侣, 守鸦人, 贞洁者, 猎手, 士兵, 镇长
- 黯月初升: 祖母, 水手, 侍女, 驱魔人, 旅店老板, 赌徒, 造谣者, 侍臣, 教授, 吟游诗人, 茶艺师, 和平主义者, 弄臣
- 梦殒春宵: 钟表匠, 筑梦师, 舞蛇人, 数学家, 卖花女孩, 城镇公告员, 神谕者, 博学者, 女裁缝, 哲学家, 艺术家, 杂耍艺人, 贤者
- 实验性角色: 半兽人, 报丧女妖, 唱诗男孩, 传教士, 村夫, 工程师, 贵族, 公主, 国王, 将军, 炼金术士, 魔术师, 农夫, 女祭司, 气球驾驶员...

**Outsiders (外来者):**
- 暗流涌动: 管家, 酒鬼, 陌客, 圣徒
- 黯月初升: 修补匠, 月之子, 莽夫, 疯子
- 梦殒春宵: 畸形秀演员, 心上人, 理发师, 呆瓜
- 实验性角色: 告密者, 解谜大师, 狂热者, 落难少女, 帽匠, 魔像, 食人魔, 瘟疫医生, 异端分子, 隐士, 政客...

**Minions (爪牙):**
- 暗流涌动: 投毒者, 间谍, 红唇女郎, 男爵
- 黯月初升: 教父, 魔鬼代言人, 刺客, 主谋
- 梦殒春宵: 镜像双子, 女巫, 洗脑师, 麻脸巫婆
- 实验性角色: 哥布林, 寡妇, 街头风琴手, 精神病患者, 科学怪人, 恐惧之灵, 灵言师, 提线木偶, 亡魂, 维齐尔, 巫师...

**Demons:**
Note: Chinese wiki does not have a dedicated category page for demons. Need to extract from individual edition pages.

### Acceptance Criteria
- [ ] Character mapping file created with all 138 characters
- [ ] Scraper successfully fetches and parses Chinese wiki pages
- [ ] All required fields extracted correctly
- [ ] Caching works (uses `.cache/html-cn/` directory)
- [ ] Chinese data merged into existing English JSON files
- [ ] No data lost during merge (English data preserved)
- [ ] Tool reports success/failure for each character

### Execution Flow
1. Build `config/character-mapping.json` with all 138 characters
2. Run scraper to fetch all Chinese data
3. Merge into existing character JSON files
4. Generate summary report

### Error Handling
- Skip characters where mapping is missing
- Log missing Chinese sections (not all pages have all sections)
- Handle network errors gracefully
- Validate merged JSON before writing
