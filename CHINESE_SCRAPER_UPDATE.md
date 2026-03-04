## Chinese Wiki Scraper - Update

### Progress Update

**Character Mapping Status:**
- ✅ Townsfolk: 54/69 mapped (18 missing)
- ✅ Outsiders: 21/23 mapped (2 missing)
- ✅ Minions: 23/27 mapped (4 missing)
- ✅ Demons: 18/19 mapped (1 minor issue with key format)

**Total: 117/138 characters mapped (~85%)**

### Completed Work

1. **Spec Created**: `CHINESE_SCRAPER_SPEC.md` - Full technical specification
2. **Character Mapping**: `config/character-mapping.json` - Partial mapping
3. **Chinese Wiki Analyzed**:
   - Base URL: `https://clocktower-wiki.gstonegames.com/index.php?title={url_param}`
   - All demons extracted from edition pages + experimental characters page
   - Townsfolk, Outsiders, Minions from category pages

### Demon Mapping (Complete)

All 19 demons mapped:
- `imp` → 小恶魔
- `ojo` → 僵尸
- `pukka` → 普加
- `vigormortis` → 维格莫提斯
- `po` → 珀
- `fang_gu` → 方古
- `shabaloth` → 亡骨魔
- `no_dashii` → 诺-达鲺
- `vortox` → 涡流
- `al-hadikhia` → 奥赫
- `riot` → 暴乱
- `lord_of_typhon` → 堤丰之首
- `yaggababble` → 牙噶巴卜
- `legion` → 军团
- `kazali` → 卡扎力
- `leviathan` → 利维坦
- `lleech` → 痢蛭
- `lil_monsta` → 小怪宝 (fixed key format)
- `zombuul` → 赞布乌

### Missing Characters (21 total)

**Townsfolk (18 missing):**
- Acrobat, Alsaahir, Amnesiac, Atheist, Bounty_Hunter, Cannibal, Cult_Leader, Fortune_Teller, Huntsman, Knight, Lycanthrope, Nightwatchman, Pixie, Poppy_Grower, Sailor, Shugenja, Steward, Village_Idiot

**Outsiders (2 missing):**
- Goon, Mutant

**Minions (4 missing):**
- Cerenovus, Devil%27s_Advocate, Evil_Twin, Harpy, Organ_Grinder, Xaan

### Next Steps - Options

**Option A: Complete Manual Mapping**
- Manually research and add missing Chinese translations
- Time: ~15-30 minutes
- Accuracy: High

**Option B: Auto-Detect from Chinese Wiki**
- Fetch each missing character's English name from Chinese wiki pages
- Some characters may not have Chinese pages yet
- Time: ~5-10 minutes
- Accuracy: Medium

**Option C: Test Scraper with Partial Mapping**
- Proceed with current 117-character mapping
- Test scraper and fix issues
- Add missing characters later
- Time: ~5 minutes
- Risk: Incomplete initial dataset

**Option D: You Provide Chinese Names**
- If you have a translation spreadsheet or reference
- I'll add them to the mapping
- Time: ~5 minutes

### Recommendation

**Option B** (Auto-Detect) then **Option A** (Manual fallback):
1. First, try to auto-detect Chinese names from existing wiki pages
2. For any still missing, manually research or ask you to provide translations
3. Then test the scraper with OpenCode

This approach minimizes manual work while ensuring completeness.

### Chinese Wiki Structure Confirmed

**Sections Found:**
- `## 背景故事` - Background Story
- `## 角色能力` - Character Ability
- `## 范例` - Examples
- `## 运作方式` - How to Run
- `## 提示与技巧` - Tips & Tricks
- `角色信息` - Character Info (English name, Edition)

**Edition Mapping:**
- 暗流涌动 → trouble_brewing
- 黯月初升 → bad_moon_rising
- 梦殒春宵 → sects_violets
- 实验性角色 → experimental
- 华灯初上 → 华灯初上 (Chinese-only)

Ready to proceed with your chosen option!
