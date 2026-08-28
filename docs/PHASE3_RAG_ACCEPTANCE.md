# 第3关 RAG 离线验收报告

## 基线
- HEAD：`09a69491a5f08d33ad3ca2da9379eb1963c42edc`
- 评测日期：2026-08-28
- 数据性质：synthetic / offline / deterministic mock transport
- 总题数：30
- 分类：keyword=6，semantic=5，hybrid=4，reranker=3，lifecycle=4，permission=5，refusal=3

## 指标
| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| Retrieval Hit Rate | 100% | >= 90% |
| Answer Accuracy | 100% | >= 85% |
| Citation Traceability | 100% | 100% |
| Refusal Accuracy | 100% | 100% |
| Permission Leakage | 0 | 0 |

## 逐题结果
| ID | Category | Retrieval | Answer | Citation | Permission | Evidence document IDs | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| KW-01 | keyword | HIT | PASS | PASS | PASS | doc-procurement-rule | 通过 deterministic offline 编排验证。 |
| KW-02 | keyword | HIT | PASS | PASS | PASS | doc-virt-017 | 通过 deterministic offline 编排验证。 |
| KW-03 | keyword | HIT | PASS | PASS | PASS | doc-expense-clause | 通过 deterministic offline 编排验证。 |
| KW-04 | keyword | HIT | PASS | PASS | PASS | doc-budget-limit | 通过 deterministic offline 编排验证。 |
| KW-05 | keyword | HIT | PASS | PASS | PASS | doc-june-deadline | 通过 deterministic offline 编排验证。 |
| KW-06 | keyword | HIT | PASS | PASS | PASS | doc-stock-article-8 | 通过 deterministic offline 编排验证。 |
| SEM-01 | semantic | HIT | PASS | PASS | PASS | doc-stock-recheck | 通过 deterministic offline 编排验证。 |
| SEM-02 | semantic | HIT | PASS | PASS | PASS | doc-submission-check | 通过 deterministic offline 编排验证。 |
| SEM-03 | semantic | HIT | PASS | PASS | PASS | doc-data-coordination | 通过 deterministic offline 编排验证。 |
| SEM-04 | semantic | HIT | PASS | PASS | PASS | doc-exception-process | 通过 deterministic offline 编排验证。 |
| SEM-05 | semantic | HIT | PASS | PASS | PASS | doc-record-retention | 通过 deterministic offline 编排验证。 |
| HYB-01 | hybrid | HIT | PASS | PASS | PASS | doc-hybrid-stock | 通过 deterministic offline 编排验证。 |
| HYB-02 | hybrid | HIT | PASS | PASS | PASS | doc-hybrid-budget | 通过 deterministic offline 编排验证。 |
| HYB-03 | hybrid | HIT | PASS | PASS | PASS | doc-hybrid-governance | 通过 deterministic offline 编排验证。 |
| HYB-04 | hybrid | HIT | PASS | PASS | PASS | doc-hybrid-closure | 通过 deterministic offline 编排验证。 |
| RR-01 | reranker | HIT | PASS | PASS | PASS | doc-rerank-stock, doc-rerank-decoy | 通过 deterministic offline 编排验证。 |
| RR-02 | reranker | HIT | PASS | PASS | PASS | doc-rerank-submission, doc-rerank-decoy-2 | 通过 deterministic offline 编排验证。 |
| RR-03 | reranker | HIT | PASS | PASS | PASS | doc-rerank-exception, doc-rerank-decoy-3 | 通过 deterministic offline 编排验证。 |
| LIFE-01 | lifecycle | HIT | PASS | PASS | PASS | doc-current-stock | 通过 deterministic offline 编排验证。 |
| LIFE-02 | lifecycle | HIT | PASS | PASS | PASS | doc-current-notice | 通过 deterministic offline 编排验证。 |
| LIFE-03 | lifecycle | HIT | PASS | PASS | PASS | doc-effective-flow | 通过 deterministic offline 编排验证。 |
| LIFE-04 | lifecycle | HIT | PASS | PASS | PASS | doc-current-approval | 通过 deterministic offline 编排验证。 |
| PERM-01 | permission | HIT | PASS | PASS | PASS | doc-dept-a-stock | 通过 deterministic offline 编排验证。 |
| PERM-02 | permission | HIT | PASS | PASS | PASS | doc-allowed-budget | 通过 deterministic offline 编排验证。 |
| PERM-03 | permission | HIT | PASS | PASS | PASS | doc-allowed-data | 通过 deterministic offline 编排验证。 |
| PERM-04 | permission | HIT | PASS | PASS | PASS | doc-allowed-exception | 通过 deterministic offline 编排验证。 |
| PERM-05 | permission | HIT | PASS | PASS | PASS | doc-allowed-retention | 通过 deterministic offline 编排验证。 |
| REF-01 | refusal | REFUSED | REFUSED | PASS | PASS | - | 无可靠依据，模型未被调用。 |
| REF-02 | refusal | REFUSED | REFUSED | PASS | PASS | - | 无可靠依据，模型未被调用。 |
| REF-03 | refusal | REFUSED | REFUSED | PASS | PASS | - | 无可靠依据，模型未被调用。 |

## 失败案例
- 无

## 权限攻击结果
- forbidden document 不进入 keyword/vector 已授权候选、reranker 输入、Top Evidence、LLM context 或 citations。
- Permission Leakage：0

## 当前限制
- 本报告只验证离线 synthetic 数据上的检索编排、权限、排序、证据、引用与拒答。
- 不代表真实 Qwen3-Embedding-4B、Qwen3-Reranker-4B 或主语言模型在真实授权集团资料上的质量验收。

## 结论
**PHASE 3 RAG ACCEPTANCE PASS**
