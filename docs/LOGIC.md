# CarbonTrace 前端：业务逻辑说明（给评审用）

这份文档说明网页的业务逻辑：谁在用、每个人走哪条路、每一步系统做什么判断、规则来自哪里。评审时请对照代码检查逻辑是否成立，暂时不评视觉。

**第四版（2026-10-28）**：接入后端第 7 轮已冻结的规则（共享冶炼厂、跨层级影响、成本情景、基准敏感性），见第 16 节。第三版按第一轮（7 条）和第二轮（6 条 + 2 处小修）评审意见修改，对照见第 13 节；管理视图见第 15 节。代码在 `carbontrace-web/`（压缩包 `carbontrace-web.zip`），Node 18+ 运行：

```
node tests/handcalc.test.mjs  # 独立手算：从原始记录按公式手算，不调用孪生
node tests/domain.test.mjs    # 规则：与 twin.py 输出一致 + 证据条件、纠错保护、补单位
node tests/journey.test.mjs   # 旅程：每条业务路径、越权、可见性、管理视图
node tests/contract.test.mjs  # 接口契约：页面依赖的字段、枚举、单位
node tests/parity.test.mjs    # 与后端 Python 判定在 409 条随机供应链上对拍（含共享冶炼厂）
node tests/percentile.test.mjs  # 百分位与目标值：500 组与 Python 逐位一致
node tests/round7.test.mjs    # 跨层级影响、路线对比、成本情景、基准敏感性：与 Python 全字段一致
```

注意：对拍只证明两套实现一致，可能一致地保留同一个错误；`expected_output.txt` 一致只证明符合预期。所以另有独立手算测试。**所有数值依赖未核实的 `RECYCLED_PCF = 0.26`，在核实之前只是演示结果，不是已验证的正式结果**，每份材料都带这条提示（`view().caveats`）。

## 1. 产品一句话

在定点（sourcing nomination）之前，找出那些**如果是假的、就会改变采购判断**的供应商碳数据，只针对这些去要证据；证据回来后在同一个孪生上重算，并且无论核验结果偏高还是偏低，供应商得到的待遇都一样。

不做的事：不替采购做决定（系统只给建议，提名由定点会记录）；不追所有未核验数据（改变不了判断的只记录）；不让供应商看到翻转点、竞争对手和内部比较。供应商自己的要求（Tier 1 的零件碳目标、Tier 2 的证据要求和保守值）按政策明确告知。

**计算范围**：所有数值是**铝材相关排放**（零件铝 kg × 供应商铝材 PCF），不是完整零件 PCF。界面统一写 "Al kgCO₂e" 或 "kgCO₂e from aluminium"。

## 2. 角色

| 角色 | 组织 | 页面 | 在旅程中做什么 |
|---|---|---|---|
| 采购（buyer） | JLR | `pages/workbench.html` | 看本轮哪些比较需要处理，追溯原因，选处理方式，批准请求函，跟踪证据，准备定点会材料 |
| 碳分析师（analyst） | JLR | `pages/review.html` | 处理"证据到了但证明不了全部说法"的情况，起草补充请求 |
| 定点会（committee） | JLR | `pages/committee.html` | 读材料，记录提名（或本轮不提名） |
| 采购经理（manager） | JLR | `pages/manage.html` | 实时看本轮全局：每组比较在哪个阶段、下一步在谁手里、各方待办数、例外事项、证据周期；点进对应角色的页面处理（第 15 节） |
| 一级供应商（tier1） | Tier1_B / C / D | `pages/supplier.html` | 转发 JLR 的请求给二级供应商，不能改内容；看到本零件的碳目标、二级供应商的核验值和本零件结果，用于计算自己零件的碳足迹 |
| 二级供应商（supplier） | Supplier_B / D / H / I | `pages/supplier.html` | 选择回应方式（A–D），提交证据，查看自己得到的待遇 |

为什么要有 Tier 1 这一步：二级供应商和 JLR 没有合同关系，要求只能经一级供应商逐级传递（JLR CSR 附录 SMR）。

## 3. 本轮数据（演示）

一轮定点：`Q4-26 · Aluminium castings`，开轮 2026-10-28，定点会 2026-12-15。三组比较：

| 比较 | 零件 | 孪生判断 | 原因 |
|---|---|---|---|
| 前悬架支架 | Bracket_T1A vs Bracket_T1B | needs_human_review | Supplier_B 的 75% 再生比例若不成立，T1B 从达标变不达标，且低碳选择翻转；Unknown_B 冶炼厂若按 13.2 算，T1B 不达标 |
| 后盖 | Cover_T1D vs Cover_T1E | needs_human_review | Supplier_H、Supplier_I 都从 **Smelter X（Unknown_B，与 Supplier_B 同一家冶炼厂）** 进料；它若按 13.2 算，低碳选择翻转；Supplier_K 的 5% 不影响判断，只记录 |
| 电机壳体 | Housing_T1C | suggest_pause | Supplier_D 按"每件"申报，不是"每 kg"，无法换算，排序被阻断 |

车上另外 7 个零件和约 140 个背景供应商是**展示网络**，不参与任何计算，也**不计入任何数量**。界面上的计数只来自实际分析范围：本轮 5 个零件、它们的 9 家供应商、未核验说法数。点背景零件时明确写"不在本轮分析内"。

## 4. 采购的旅程（主线）

每组比较独立走 5 步。左侧步骤条显示当前比较走到哪一步；还没满足条件的步骤点不进去，并提示原因。

| 步骤 | 采购看到什么 | 系统依据 | 能做什么 | 进入下一步的条件 |
|---|---|---|---|---|
| 01 看本轮 | 三组比较的判断标签和第一条原因；车上 10 个零件 | `decide()` | 点任一比较；点普通零件看它的供应链（只读） | — |
| 02 追溯说法 | 每条未核验说法：申报值、测试值、翻转点、影响什么；底部"如果说法不对"情景条实时重算 | `checkFlip()`、`checkTarget()`、`internalBrief()` | 切换情景（单条说法、两条组合） | 随时可进 03 |
| 03 选处理方式 | 三个选项（壳体是两个），推荐项有标记；内部简报（目标值、翻转点）折叠在下方，标"仅采购可见" | `actionPlan()`、`alternatives()` | 要证据 / 改用已核验供应商 / 按保守值继续；壳体：要每 kg 数据 / 本轮不排 | 选"要证据"后生成草稿函，泄密检查通过才能批准 |
| 04 跟踪证据 | 每封函的时间线：发出 → Tier 1 转发 → 供应商选路 → 证据到达；截止日倒数；到达后显示重算结果、时效窗口、每条说法的核验条件结果、纠错保护、费用分担 | `assessImprovement()`、`evidenceChecks()` | 发提醒；迟到证据：用 / 保持保守值；影响复核：监控 / 提交定点会 / 不变 | 见第 5 节"就绪" |
| 05 定点会材料 | 建议、每个零件的数值和依据来源（已核验 / 保守值 / 替代方案）、迟到证据的处理、下次报价可复用的证据；已提名后显示提名时的快照 | `view().basis`、`findReusable()` | 打开定点会页面 | — |

三个处理方式的含义：

- **要证据（推荐）**：按 `draftRequests()` 生成每个供应商一封函，一封函可包含多条说法（Supplier_B 的函同时问再生比例和冶炼厂）。批准时重新计算截止日：`min(批准日 + 30 天, 定点日 − 5 个工作日)`。
- **改用已核验供应商**：从 `alternatives()` 给出的前几个方案里选一个，材料里该零件用替代方案的数值。
- **按保守值继续**：所有会改变判断的说法都按测试值计（T1B 变成 96.29），通常会触发"无零件达标，上报"。

已发出的函不影响改选：采购可以在请求在途时改为"替代方案"或"保守值"并直接生成会前材料，**函保持打开**，证据照收、入库复用，若在定点前到达则按第 6 节评估，并提示采购"新证据到了，检查你的处理方式"。再次选"要证据"之前必须先撤回在途的函（避免重复发函）。

情景条里"两条同时不成立"标为**联合压力情景**：两种设定在当前模型中可同时应用，作为联合压力情景，不赋予发生概率。原铝因子只作用于原铝份额（`(1−再生比例)×原铝`），再生比例按 0% 测试时原铝份额为 100%，不存在重复调整（手算测试 `joint stress`）。

**替代方案是候选，不是可定点选项。** `alternatives()` 找到的是碳数据已核验的来源，不代表已通过材料、工艺、质量、产能和交付要求。选"改用替代方案"时，采购可勾选"资格已批准（模拟前提）"；不勾选则材料里标"候选，未通过资格"，材料不就绪，直到采购记录资格批准人（`qualify_alternative`）。

## 5. 证据请求的状态机

```
draft ──批准(采购, 泄密检查通过)──▶ approved ──转发(对应 Tier 1)──▶ forwarded
forwarded ──选 A/B/C(供应商, 记录披露日)──▶ responded ──提交证据(可部分)──▶ verified | partially_verified
forwarded ──选 D──▶ declined（保守值生效）
approved / forwarded / responded ──时钟越过截止日──▶ expired（暂按保守值）
expired ──供应商仍可选路(若未选)并提交──▶ verified | partially_verified，标记迟到，按第 6 节处理
partially_verified ──分析师起草补充──▶ 原函关闭(superseded_by)，已核验说法保留；新 draft 只含剩余说法
data_fix: forwarded ──选 A──▶ responded ──提交每 kg 值──▶ restated ──▶ 孪生用新单位重算，比较回到"选处理方式"
任何未关闭的函 ──采购撤回──▶ withdrawn
```

判断规则（都在 `src/store.js` 的 `reduce()` 里，违反时抛出原因给界面显示）：

- 只有采购能批准；草稿的泄密检查（`leaks()`）不为空时不能批准。
- 只有函上写的那个 Tier 1 能转发；供应商在转发之前看不到函。
- 只有收件的供应商能选路和提交；只能选函上列出的选项。
- **任何选项都可以只交部分说法**，每条说法单独评估。选项只决定 JLR 提供的支持（B 有核验费分担），不决定证据能否被接收。
- 选了 A/B/C 之后过期（核查排期慢）：仍可提交，按迟到处理。
- 补充请求：原函标记 `superseded_by` 并关闭，分析师待办消失；已核验的说法留在证据库不重复要；**费用分担每条请求链只给一次**（补充函的 B 选项写明"已在 REQ-x 下给过"）。
- 证据入库去重：同一份证书（编号相同）对同一说法已在库时，不再新建记录，而是把已有记录**关联**到新请求（`request_ids`）。一条记录可服务多个请求和多轮，复用从不被拦。
- 定点会只能在材料"就绪"时提名。就绪 = 已选处理方式 + 没有待批草稿 + （仅当处理方式是"要证据"或"补单位"时）没有在途的函和待复核的证据 + 没有待采购决定的迟到证据 + 替代方案已记录资格批准。

### 证据核验条件

检查**按说法和证据类型配置**（`EVIDENCE_RULES`），不是所有证据共用一套门槛。全部适用检查通过才算"已核验"，否则转分析师，原因同时显示给供应商（`evidenceChecks()`）：

| 说法 | 适用检查 |
|---|---|
| 铝材 PCF / 冶炼厂来源（`primary_pcf`） | 证据类型能证明；来源身份（冶炼厂已写明）；供应关系已确认；产品；报告期近期（2 年内）；核查范围包含；单位每 kg；边界 cradle-to-gate；有效期 |
| 再生含量（`recycled_share`） | 证据类型能证明；含量定义（消费前/后废料）；对应产品或批次；场地；报告期；核查范围包含；有效期。**不检查**每 kg 单位和边界（证书通常以百分比表示） |
| 只对核查声明（第三方核验）适用 | 保证等级 ≥ limited；核查意见无保留。监管链证书不按保证等级判断 |

**Demo 范围限制**：只有**物理（隔离）再生含量**自动通过。质量平衡（mass balance）是公认的监管链模式，**不判无效**：它不记为检查失败，而是记为"超出演示自动范围，由分析师决定"（`scope_limits`），因为孪生的再生比例计算假设是物理含量。

**边界说明**：系统检查的是这些条件是否匹配；它**不鉴定文件真伪**。演示中的证据是预先标注好的模拟证据；正式使用时由分析师确认文件本身。

## 6. 时间与迟到证据

"迟到"是流程标记，不自动决定证据有没有决策价值。按**到达时间**分三段（不是按核查机构完成日）：

| 到达时间 | 处理 |
|---|---|
| 截止日前（含当天） | 正常审核，更新本轮判断 |
| 截止日后，定点前 | 标记迟到。与当前材料（保守值）比，若会改变达标状态或低碳选择 → 材料暂不就绪，**采购决定**"用于材料"或"保持保守值"；若不改变任何结论 → 直接用核验值（更准确），不需决定。**保持保守值必须记录**：问题类型（适用性 / 分析师审核未完成 / 程序问题；"迟到"不是可选理由）、具体理由、批准人、后续安排。材料同时显示新证据的数值和未解决的问题 |
| 定点后 | **保留提名时的决策快照**（材料显示快照），与快照比较；有实质影响 → 开启**影响复核**，采购记录结果：监控 / 提交定点会 / 不变；**不自动撤销也不忽略**；无影响 → 只记录，下一轮复用 |

"实质影响"在 store 里按当前材料实际使用的数值计算（`outcomeChange()`），不是按申报值。

## 7. 纠错保护与同等待遇

**回应请求 ≠ 披露错误。** 分别记录四件事：

| 记录 | 何时产生 | 带来什么 |
|---|---|---|
| 回应（`responded_on`） | 供应商选择 A/B/C/D | 及时回应（30 天内）→ 参与支持（`timely_response`：费用分担资格、快速复用） |
| 披露（`disclosure`：日期、哪些说法、写了什么问题） | 供应商单独提交"告诉 JLR 哪里不对或有局限"，必须选说法并写内容 | 纠错保护，**只覆盖披露了的说法** |
| 提交（`submitted_on`） | 提交证据 | 决定时效窗口（第 6 节） |
| 核验完成（`verified_on`） | 核查机构完成日 | 决定证据有效期和复用期 |

**纠错保护**（`correctionProtection()`）：

- 没有披露 → `no_disclosure`（不适用）。只点了"申请帮助"不会得到保护。
- 披露日在请求后 30 天内 → 有保护；之后 → 无保护。核查排期慢不影响保护。
- 供应商主动来报（不经请求）→ 有保护。
- 被 JLR 抽查发现 → **先做事实调查**（`fact_finding`），不自动等于故意隐瞒。
- 保护资格和"数据能否用于本轮"是两个独立判断。

**同等待遇**的含义收窄为：在资格、时间和证据充分性相同的情况下，**只改变核验后的排放数值，不改变程序权益**。不要求不同条件下待遇都一样（证据失效、范围不足、披露太晚确实不同）。测试按单变量做（`same treatment: change one variable at a time` 和 domain 测试）：

| 只改变 | 待遇 |
|---|---|
| 核验值偏高 / 偏低 | 完全相同 |
| 按时 / 迟到（披露日、核验日相同） | 完全相同（迟到只影响流程，不影响权益） |
| 完整 / 部分证据 | 已交说法的待遇相同 |
| 及时披露 / 超过 30 天披露 / 没有披露 | 只有纠错保护不同 |
| 应请求 / 主动 / 抽查发现 | 只有纠错保护不同（抽查 → 事实调查） |
| 同一凭证重复提交 | 关联已有记录，不新建，不重复给复用期或费用分担 |

## 8. 各方能看到什么

| 信息 | 采购 | 分析师 | 定点会 | Tier 1 | Tier 2 |
|---|---|---|---|---|---|
| 翻转点、内部比较 | ✓（内部简报） | ✓ | ✓ | ✗ | ✗ |
| 其他供应商名称、替代方案、竞争零件 | ✓ | ✓ | ✓ | ✗ | ✗ |
| 零件碳目标 | ✓ | ✓ | ✓ | 自己零件的（按政策告知） | ✗（Tier 2 没有零件目标；它的要求是证据要求和保守值，写在函里） |
| 请求函内容 | ✓ | ✓ | ✓ | ✓（只读转发） | ✓ |
| 提交的核验值 | ✓ | ✓ | ✓ | 自己供应商的 | 自己的 |
| 零件结果 | ✓ | ✓ | ✓ | 自己零件的 | ✗ |
| 核验条件不通过的原因 | ✓ | ✓ | — | — | 自己的 |
| 自己得到的待遇 | — | — | — | — | ✓ |

实现：供应商端只读 `inbox()`。测试 `visibility` 检查 Tier 2 拿不到目标、翻转点、其他供应商名和 T1A；Tier 1 拿不到翻转点、其他供应商名和 T1A，但能拿到自己零件的目标和结果；别的 Tier 1 什么都看不到。

**工程边界**：所有数据和角色切换都在浏览器里，`inbox()` 过滤只证明**界面隔离**，不是真实的访问控制。演示条上标注"simulated roles"。正式版在服务器端按登录组织执行同样的规则。

## 9. 规则出处对照

`src/domain.js` 是 `carbontrace-code/round6/twin.py` 和 `round4/incentive.py` 的逐函数移植，返回字段保持 Python 的命名，方便对比。

| Python | JS | 说明 |
|---|---|---|
| `supplier_pcf` / `node_pcf` / `part_pcf` | `supplierPcf` / `nodePcf` / `partPcf` | 截断法：(1−再生比例)×原铝 + 再生比例×再生铝；零件 = Σ kg × 供应商 PCF |
| `list_gaps` | `listGaps` | 未核验冶炼厂按更高的公开值测试；未核验再生比例按 0% 测试 |
| `break_even` / `check_flip` | `breakEven` / `checkFlip` | 单条和两两组合测试；组合风险 = 组合翻转而任一单条都不翻转 |
| `co2e_target` / `check_target` | `co2eTarget` / `checkTarget` | 目标 = 零件铝 kg × 已核验供应商 PCF 的第 25 百分位（开轮时固定） |
| `decide` | `decide` | continue_analysis / needs_human_review / suggest_pause |
| `alternatives` / `evidence_deadline` / `action_plan` | 同名 camelCase | |
| `submit_evidence` / `treatment` / `find_reusable` / `assess_improvement` | 同名 camelCase | |
| `internal_brief` / `supplier_requests` / `leaks` / `render_letter` | 同名 camelCase | 函的文字与 round4 输出逐字一致（有测试） |

## 10. 产品补充（不在 Python 孪生里，请重点评审）

| 补充 | 位置 | 理由 |
|---|---|---|
| Tier 1 转发这一步，以及"转发前供应商看不到函" | `reduce: forward` | 合同关系决定的真实流程；Python 只在函上写了 via |
| 截止日在**批准时**重算 | `reduce: approve_request` | 草稿可能放几天，截止日应从真正发出那天算 |
| 迟到证据三段处理、采购决定、影响复核 | `reduce: submit_evidence / late_decision / close_impact_review`，`view()` 的 `usedThisRound` | 评审意见 1 |
| 证据核验条件逐项检查 | `domain: evidenceChecks()` | 评审意见 3 |
| 纠错保护按披露日；抽查 → 事实调查 | `domain: correctionProtection()` | 评审意见 2 |
| Tier 1 看本零件目标、核验值和结果 | `inbox('tier1')` | 评审意见 4 |
| 补单位后回灌孪生，并与模型值做一致性检查（相差超过 10% 提示分析师，不阻断） | `buildGraph({restated})`、`restatementCheck()` | 评审意见 5 |
| 补充请求关闭原函、费用分担每链一次、重复凭证拒绝 | `reduce: follow_up / submit_evidence` | 评审意见 5、6 |
| 在途请求不阻止"替代方案 / 保守值" | `reduce: choose_action`、`view()` 的 blockers | 评审意见 5 |
| 披露与回应分开 | `reduce: disclose`、`domain: correctionProtection()` | 第二轮意见 1 |
| 证据检查按说法和类型配置；质量平衡为范围限制 | `domain: EVIDENCE_RULES`、`evidenceChecks()` | 第二轮意见 2 |
| 不采用重大迟到证据须记录理由 | `reduce: late_decision`、`LATE_ISSUES` | 第二轮意见 4 |
| 替代方案须记录资格批准 | `reduce: choose_action / qualify_alternative` | 第二轮意见 5 |
| 管理视图 | `store: overview()`、`waitingOn()`，`pages/manage.html` | 第 15 节 |
| 撤回、提醒、演示时钟 | `reduce` | 操作需要；时钟仅演示用 |
| "按保守值继续"把所有关键说法同时按测试值计 | `view().basis` | 比逐条更保守，标为联合压力情景 |

## 11. 已知假设和待确认

1. `RECYCLED_PCF = 0.26`：是从孪生输出反推的。`pcf_cal.py` 不在共享文件夹里，**来源和边界尚未核对**。不阻止界面开发，但在核实前**所有数字都是未验证的演示结果**，每份材料和管理视图都带提示（`CAVEATS`）。请提供 `pcf_cal.py` 或其出处。
2. 碳目标 = 已核验供应商 PCF 的第一四分位（含端点）：**模拟政策**，不是行业标准，也不是已确认的 JLR 规则；界面写明。
3. 报告期 2 年、补单位一致性 10%、纠错窗口 30 天、只自动接受物理再生含量：都是假设参数或演示范围限制，集中在 `domain.js`。
4. 替代来源的资格批准是模拟前提，没有接入真实的工程或供应商质量流程。
5. Tier 1 的零件目标按"政策告知"处理，标为模拟。
6. 定点会在材料未就绪时不能强行提名。
7. 多轮之间的证据复用只演示了查询（`findReusable`），没有"下一轮"界面。
8. 选项 B 的费用分担需要采购另行批准，目前只记录 granted / 已给过，没有单独审批步骤。

## 12. 评审清单

- 五个测试文件全部通过。
- 迟到证据三段、核验条件、纠错保护是否符合第 6、7 节。
- 状态机是否还有死路：已选路后过期、部分核验后补充、替代/保守下仍在途的函、补单位后的壳体。
- 可见性：第 8 节的矩阵是否与 `inbox()` 一致；有没有路径让翻转点或其他供应商名出现在供应商端。
- 数量口径：界面计数是否只来自分析范围。

## 13. 第一轮评审意见处理对照

| # | 意见 | 处理 | 测试 |
|---|---|---|---|
| 1 | 迟到证据过于机械 | 三段处理（第 6 节）；材料性按当前材料计算 | journey: `late evidence before nomination …`（两条）、`late evidence after nomination …`（两条） |
| 2 | 纠错保护不应按核验完成日 | 分别记录披露、提交、核验日；按披露日；抽查→事实调查 | domain: `correction protection follows disclosure …`；journey 定点后迟到用例断言仍有保护 |
| 3 | 证据不能只靠类型＋保证等级 | 11 项条件（第 5 节）；写明不鉴定真伪 | domain: `evidence is verified only when every condition matches …`；journey: `a statement that does not match …` |
| 4 | 权限要兼顾保密和计算职责 | Tier 1 看本零件目标、核验值、结果；标注浏览器端仅模拟 | journey: `visibility …` |
| 5 | 状态机死路 | 任何选项可部分提交；选路后过期可交；补充请求关闭原函；替代/保守不等请求；补单位回灌孪生 | journey: `any option may send part …`、`option chosen, then the deadline passes …`、`certificate proves recycled share only …`、`proceed on an alternative …`、`housing: data fix …` |
| 6 | 同等待遇测试要收窄 | 单变量测试；重复凭证去重 | journey: `same treatment: change one variable at a time`、`the same certificate is not submitted twice` |
| 7 | 展示与计算范围 | 背景网络不计数；联合压力测试标注；目标标"模拟政策"；"铝材相关排放"；0.26 标待核 | 界面文案；第 1、3、11 节 |

### 第二轮评审意见处理对照

| # | 意见 | 处理 | 测试 |
|---|---|---|---|
| 1 | 选择回应方式 ≠ 披露错误 | 回应、披露、提交、核验分开记录；披露须写说法和内容；保护只覆盖披露的说法；及时回应另给参与支持 | domain: `correction protection needs an actual disclosure …`；journey: `choosing a route is not a disclosure …` |
| 2 | 证据检查不能共用全部条件 | 按说法和证据类型配置（第 5 节表）；质量平衡为 Demo 范围限制，不判无效 | domain: `evidence checks depend on the claim and the evidence type`；journey: `a statement that does not match …` |
| 3 | 可同时发生 ≠ 相互独立 | 改为"可同时应用的联合压力情景，不赋予概率"；手算确认原铝因子只作用于原铝份额 | handcalc: `joint stress …` |
| 4 | 不采用重大证据需记录理由 | 问题类型（"迟到"不在其中）+ 理由 + 批准人 + 后续；材料同时显示新证据与未解决问题 | journey: `late evidence before nomination that changes the outcome …` |
| 5 | 替代方案不能默认可采购 | 默认是候选，须记录资格批准（或勾选模拟前提）才就绪 | journey: `alternative sourcing and conservative values`、`proceed on an alternative …` |
| 6 | 测试通过 ≠ 规则正确 | 新增独立手算测试；所有材料标"演示数字未验证" | `tests/handcalc.test.mjs` |
| 小修 | 去重不应拦复用 | 改为入库去重、关联多个请求 | journey: `registry de-duplication …` |
| 小修 | "字段只增不改"过强 | 版本化接口 + 契约测试（第 14 节） | `tests/contract.test.mjs` |

## 14. 前端与 agent 后端的接口约定（版本化）

页面只依赖 `view(s, key)`、`inbox(s, role, org)`、`todos(s, role, org)`、`overview(s)` 的输出，以及 `reduce()` 接受的动作。约定写在 `store.js` 的 `CONTRACT`（当前 v3，第 7 轮只加字段，见第 16 节）：字段清单、阶段/状态/时效窗口/依据来源/纠错保护的允许值、各数值的单位。

- 字段名不变但**含义、单位或允许值变了**，也算破坏性变化：必须升 `CONTRACT.version`，并同步页面。
- `tests/contract.test.mjs` 在覆盖各条旅程的一组状态上，检查真实输出与 `CONTRACT` 一致。后端导出数据时跑同一个测试。
- 数据增减（供应商、零件、轮次）只改 `src/data.js` 或后端导出的数据，不需要改契约。
- 需要改前端的情况：契约升版本、新增用户动作（加按钮和 reducer 分支）、新增角色（加页面视图）。

## 15. 管理视图（`pages/manage.html`）

给采购经理或可持续负责人看本轮全局。**实时**：它读的是和其他页面同一份状态和同一个读模型（`overview()` 由 `rounds()`、`todos()`、请求状态派生），供应商一提交、采购一批准，它立刻变化。它本身不做操作，每一项都链接到"下一步在谁手里"的那个角色页面。

| 区块 | 内容 | 来源 |
|---|---|---|
| 指标条 | 距定点会天数；材料就绪数/总数；未完成待办总数；例外事项数；平均证据周期（批准发出到证据到达） | `overview()` |
| 阶段看板 | 每组比较在哪个阶段（与工作台同一套阶段），第一条阻塞原因，下一步在谁手里 | `view().stage / blockers`、`waitingOn()` |
| 谁手上有活 | 采购、分析师、定点会、各 Tier 1、各供应商的待办数，点进去处理 | `todos()` |
| 例外事项 | 7 天内到期或已过期、待分析师复核、待采购决定的迟到证据、未关闭的影响复核、未通过资格的替代方案 | `overview().open_items` |
| 请求清单 | 每封函的状态、下一步在谁手里、截止日和剩余天数、是否迟到 | `overview().requests` |
| 最近操作 | 审计日志 | `state.log` |

"下一步在谁手里"（`waitingOn()`）：草稿 → 采购；已批准 → 对应 Tier 1；已转发/已回应 → 供应商；部分核验未补充 → 分析师；迟到待决定、影响复核 → 采购；材料就绪 → 定点会。测试 `management overview follows the item …` 沿一条请求走完整条链路逐步断言。

## 16. 第 7 轮：跨层级影响、成本情景、基准敏感性（规则已冻结，前端接入）

规则来源：`carbontrace-code/round7/`（`twin.py`、`network.py`、`cost_model.py`、`benchmark.py`）和《第7轮-跨层级影响与成本情景-规则说明》。前端端口与 Python **全字段一致**（`tests/round7.test.mjs`，对照文件由 `tests/dump7.py` 从 Python 导出）。

### 16.1 规则变化

| 规则 | 前端实现 |
|---|---|
| Supplier_H、Supplier_I 改用 Unknown_B，删除 Unknown_H、Unknown_I；pcf 不变 | `data.js`；Unknown_B 显示为 **Smelter X**（`DISPLAY`，只改显示） |
| 冶炼厂说法只算本比较范围内的客户（新字段 `suppliers`），任一在复核中则为 under_review | `domain.decide()` |
| 行动方案按说法节点找受影响零件；请求发给全部范围内客户（`to_all`），每家供应商一封信 | `actionPlan()`、`supplierRequests()` |
| 并列：没有低碳选择（`winner = null`），并列算排序变化 | `checkFlip()`、`lowerCarbon()` |
| origin_link：冶炼厂 PCF 经一家客户核验后，其他客户 `origin_link_verified = false`，缺口按保守一次值测；来源证明只有产品和边界都与冶炼厂 PCF 证据一致才算；接受 `origin_document_check` 或第三方核验 | `applyEvidence()`、`listGaps()`、`nodePcf()`、`EVIDENCE_RULES.origin_link` |
| `round2 = Number(x.toFixed(2))`；`percentileInclusive`；`BENCHMARK_PERCENTILE = 0.25` | `domain.js`，500 组百分位用例逐位一致 |

### 16.2 旅程里的变化（产品补充，请评审）

- **请求自动收窄**：同一冶炼厂的 PCF 经一家客户核验后，系统把其他客户**还开着的**同一冶炼厂 PCF 请求改成只要 origin link（只会少问，不会多问），历史里记一条"request narrowed"。不写是哪家客户核验的，因为 Tier 1 和供应商不能看到 JLR 的其他供应商。若 origin link 已不影响该比较的决定，该说法从信里删除；信里没有说法了就撤回（"no longer needed"）。演示：Supplier_H 交了 Smelter X 的 PCF 后，Supplier_I 的请求撤回（以保守值测也不再翻转），Supplier_B 的请求变成"再生比例 + origin link"。
- **供应商表单**：origin link 是一个勾选（"我们这批产品的原铝来自那家已核验的冶炼厂"），证据类型可选"采购记录 / 熔铸证书"（`origin_document_check`）。没有数值。
- 测试：`journey: shared smelter …`、`domain: shared smelter verified through Supplier_B …`。

### 16.3 页面

| 位置 | 内容 | 来源 |
|---|---|---|
| 工作台第 2 步 | 说法表里冶炼厂显示 Smelter X；若该冶炼厂有多家客户，显示"Shared upstream：供 N 家供应商，可改变 M 组比较"和按钮 | `nodeImpact()` |
| 3D：点冶炼厂或供应商 | 该节点以下所有路径点亮，其他退后；冶炼厂会依次脉冲到两侧零件 | `scene.impact()` |
| 跨层级影响面板 | 供应商数、零件数、**广度**（可改变几组比较）；每组比较的**重要性**（排序翻转 / 某零件不达标 / 被数据问题阻断）单独列出，**不合成一个分数**；采购金额 `spend` 尚无数据，写明 | `nodeImpact()` |
| 路线对比 | 逐家核验 / 共享·冶炼厂已有核验 PCF / 共享·新核验：成本（相对单位，1 = 一次第三方核验）、用时、余量（<5 天标"有风险"，负数标"晚 N 天"）；两种情况分别推荐；新核验赶不上本轮时提示留给下一轮；先问冶炼厂是否已有核验 PCF | `sharedVsSeparate()` |
| What-if 两个独立控件 | **PCF 情景**（各说法按保守值、两两组合）和**基准情景**（P10 严格 / P25 默认 / P50 宽松）。基准只改目标线和达标状态，不改任何 pcf；下方固定写 "Current modelling assumption. Actual JLR benchmark methodology is not publicly specified." | `view(s, key, {benchmark})` |
| 管理视图 · 成本情景 | 本演示轮：逐条核验 **5.5** vs CarbonTrace **5.232**（约少 5%，固定成本吃掉大部分节省），逐项列出；默认参数下少于约 2.4 条记录时 CarbonTrace 更贵；列出 CarbonTrace 输的情形 | `demoRound()`、`breakEvenN()`、`losingConditions()` |
| 管理视图 · 基准敏感性 | P10/P25/P50 的每 kg 基准值；哪些比较对基准选择敏感、改变了什么；留一法 P25 范围（稳健性检查，不是置信区间） | `benchmarkSensitivity()`、`leaveOneOut()` |

### 16.4 契约 v3（只加字段）

`view()` 新增 `benchmark {scenario, q, per_kg, note}`；`CONTRACT` 新增 `claims`（含 `origin_link`）、`benchmark_scenarios`，以及第 7 轮分析函数的字段清单（`node_impact`、`impact_comparison`、`shared_vs_separate`、`routes`、`cost_compare`、`benchmark_sensitivity`）和成本单位。原有字段含义不变。`contract.test.mjs` 另检查：三种基准下 pcf 都不变。

### 16.5 渲染调整

- 3D 配色与界面同一套（冷青夜色、钠灯琥珀、霓虹红橙）；车体点云改为青色。
- 相机视窗偏移，使孪生始终居中在左右面板之间的空白区域，面板变化时平滑跟随。
- 标签只放在空白区域内；按优先级放置，会互相遮挡的低优先级标签淡出，靠边的标签横向挪进来而不是被截断。
- 证据透镜：鼠标在地面上带一圈柔光，经过的关键节点提亮（Lithos 光标聚光的 3D 版本）。
- 演示条（角色、时钟）放进页头，不再盖住倒计时。
