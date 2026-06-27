export type TrainDirection = 'l' | 'r';

export type StationType = 'none' | 'railway' | 'airport';

export type TransferLine = {
  lineId: string;
  color: string;
  textColor: string;
};

export type KyuriStation = {
  id: string;
  chName: string;
  enName: string;
  type: StationType;
  transfer: TransferLine[];
};

/** Kyuri naive 3.0：不含 njMetroSettings（南京地铁线路图生成器可在其 YAML 中扩展该块） */
export type KyuriNaiveDocV3 = {
  version: 3;
  schema: string;
  direction: TrainDirection;
  currentStnId: string;
  lineId: string;
  color: string;
  /** 本线标识块上的文字色，与换乘条目的 `textColor` 对称 */
  textColor: string;
  stations: KyuriStation[];
};
