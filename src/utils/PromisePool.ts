class PromisePool {
  private max: number; // 最大并发数
  private num: number; // 当前并发数
  private index: number; // 用于保证 result 中的顺序与 taskList 中的顺序相同
  private result: Array<{ state: string; data?: any; error?: any }>; // 保存所有 Promise 的结果
  private taskList: Array<() => Promise<any>>; // Promise 列表
  private static poolResult: Promise<any[]> | null = null; // 单例模式的静态实例

  constructor(max: number) {
    this.max = max;
    this.num = 0;
    this.index = 0;
    this.result = [];
    this.taskList = [];
  }

  // 添加任务，每个任务是返回 Promise 的函数，或者是由此类函数的数组
  addTask(item: (() => Promise<any>) | Array<() => Promise<any>>): void {
    if (Array.isArray(item)) {
      this.taskList = this.taskList.concat(item);
    } else {
      this.taskList.push(item);
    }
  }

  // 开始执行任务
  start(): Promise<any[]> {
    if (!PromisePool.poolResult) {
      PromisePool.poolResult = new Promise((resolve) => {
        // 使并发数达到最大值
        while (this.num < this.max && this.taskList.length) {
          this.num++;
          let item = this.taskList.shift()!;
          this.setTask(item, this.index, resolve);
          this.index++;
        }
      });
    }
    return PromisePool.poolResult;
  }

  // 执行 Promise
  private async setTask(
    item: () => Promise<any>,
    index: number,
    resolve: (value: any[]) => void
  ): Promise<void> {
    await this.randomDelay(); // 随机延迟 0-1 秒

    item()
      .then((data) => {
        this.result[index] = { state: "fulfilled", data };
      })
      .catch((error) => {
        this.result[index] = { state: "rejected", error };
      })
      .finally(async () => {
        this.num--;
        // 如果 taskList 中还有任务，则取出第一项重复该过程
        if (this.taskList.length) {
          this.num++;
          let newItem = this.taskList.shift()!;
          await this.setTask(newItem, this.index, resolve);
          this.index++;
        }
        // 如果并发数为 0，表示所有任务完成，调用 resolve 方法并重置各项属性
        if (this.num === 0) {
          resolve(this.result);
          PromisePool.poolResult = null;
          this.index = 0;
          this.result = [];
        }
      });
  }

  // 随机延迟 0-1 秒
  private randomDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));
  }
}

export default PromisePool;
