// 本文件提供中文制度类问题的通用术语归一化，只扩展检索词，不生成答案或改变资料权限。

const TERM_FAMILIES = [
  ["工作时间", "上下班", "上班", "下班", "作息", "作息时间", "正常班", "班次"],
  ["考勤", "考勤方式", "打卡", "签到", "人脸识别", "指纹", "钉钉", "企业微信", "定位打卡"],
  ["出差", "差旅", "出差要求", "出差审批", "报销", "住宿", "交通", "差旅费"],
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * 根据用户问题扩展同一制度概念的常见写法。
 * 输入是用户问题，输出仅为可用于关键词检索的短语；不读取数据库、不调用模型，也不加入任何业务事实。
 */
export function expandChineseRetrievalPhrases(query: string) {
  const normalizedQuery = normalize(query);
  const phrases = new Set<string>();
  for (const family of TERM_FAMILIES) {
    if (family.some((phrase) => normalizedQuery.includes(normalize(phrase)))) {
      for (const phrase of family) phrases.add(normalize(phrase));
    }
  }
  return [...phrases].filter(Boolean);
}
