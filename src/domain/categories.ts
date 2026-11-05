/** 分类与来源的公共常量 */

export const CATEGORIES = [
  '餐饮',
  '交通',
  '购物',
  '居住',
  '通讯',
  '娱乐',
  '医疗',
  '教育',
  '人情往来',
  '退款',
  '其他',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SOURCE_LABEL: Record<string, string> = {
  wechat: '微信',
  alipay: '支付宝',
  bank: '银行',
};

export const SOURCE_COLOR: Record<string, string> = {
  wechat: '#07c160',
  alipay: '#1677ff',
  bank: '#4f6bff',
};
