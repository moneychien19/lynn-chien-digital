---
title: 用 Property-based Testing 測試複雜業務規則
---

> English version: [[engineering/property-based-testing|Testing Complex Business Rules with Property-based Testing]]

## TL;DR

在什麼情況下我們可以使用 Property-based Testing（PBT），又該怎麼設計 property？當業務規則的輸入組合太多、規則之間又互相影響時，手寫測資很難涵蓋完整。這時可以改問「不管輸入是什麼，哪些事情一定要成立」，再讓 fast-check 隨機產生大量輸入去驗證，失敗時還會自動把反例縮到最小。本文以 PierogIO 的訂單計價規則為例，介紹四種設計 property 的方向、generator 的範圍如何影響測試能力，以及 PBT 的限制。

## 情境

給定一個複雜的業務規則，我們可以怎麼測試它？

以 [PierogIO](https://github.com/CMU-623/PierogIO) 為例，這是一個（虛構的）匹茲堡 pierogi 外送平台，它的訂單計價規則如下：

1. Subtotal：商品價格加上 add-ons（酸奶油 \$0.99、炸洋蔥 \$1.49、培根碎 \$1.99）
2. Discounts：12 入 95 折、24 入 9 折，再加上 coupon（`PIEROGI-BOGO`：同口味 6 入第二盒半價；`FIRST10`：滿 \$20 打 9 折）
3. Delivery：依 zone 收基本運費（local \$3.99、outer \$6.99），折扣後 subtotal 達門檻就免運（guest \$50、regular \$40、VIP \$30），rush 另加 \$2.99
4. Tax：只有 hot item 課 8%，frozen 免稅；訂單裡有 hot item 時，運費也要課稅
5. Total = Subtotal − Discounts + Delivery + Tax

若使用一般傳統的 example-based 測試，理論上我們可以根據各欄位的邊界值或是代表值設計測資，但實際要寫測資時會遇到兩個問題：

1. **組合爆炸**：一個訂單項目有 hot/frozen、四種口味、三種數量、任意組合的 add-ons；整張訂單再乘上 coupon、zone、tier、rush。就算每個維度只挑一兩個代表值，也會組合出為數過多的測試。
2. **規則之間會互相影響**：免運門檻看的是「折扣後」的 subtotal，所以折扣規則寫錯會連帶讓運費錯；運費要不要課稅取決於有沒有 hot item，所以 tax 和 delivery 綁在一起。單獨測每個函式都對，組起來不一定對，而 example-based 測試最容易漏的就是這種交互作用。

此時我們就可以使用 Property-based Testing。

## PBT 與 fast-check 快速入門

Example-based 測試（也就是一般單元測試常用的技巧）是「給定這個輸入，預期這個輸出」；PBT 則是「對所有合法輸入，這個性質都要成立」，由框架隨機產生大量輸入去驗證。它的概念來自 Haskell 的 QuickCheck，[fast-check](https://fast-check.dev/) 則是 JavaScript/TypeScript 生態系的主流實作，可以搭配 Vitest、Jest 等測試框架使用。

一個 fast-check 測試由三個部分組成：

- **Arbitrary**：描述輸入空間，例如 `fc.integer({ min: 0 })`、`fc.constantFrom('hot', 'frozen')`，可以用 `fc.record`、`fc.array` 組成複雜的物件
- **Property**：`fc.property(arb1, arb2, …, predicate)`，predicate 回傳 `false` 或丟出例外就算失敗
- **Runner**：`fc.assert(property)` 預設跑 100 組隨機輸入，任何一組失敗就讓測試失敗

```js
const fc = require('fast-check');

it('subtotal is a non-negative integer', () => {
  fc.assert(
    fc.property(orderArb, (order) => {
      const result = subtotal(order);
      return result >= 0 && Number.isInteger(result);
    })
  );
});
```

### Shrinking：把反例縮到最小

隨機產生的失敗輸入通常又大又亂，可能是五個商品、各種 add-ons、奇怪的價格。fast-check 找到失敗輸入後，會自動嘗試更「簡單」的候選（陣列刪掉元素、整數往下限靠、`constantFrom` 往第一個值靠），只要候選還會失敗就繼續縮，直到再縮任何一步都會通過為止。這個過程叫 **shrinking**。

假設實作在 `FIRST10` 這張 coupon 上有錯：沒有檢查 \$20 門檻，而且直接折 \$10，而不是打 9 折。後面的折扣 property 失敗時，fast-check 會印出類似這樣的結果：

```text
Property failed after 4 tests
{ seed: -851621495, path: "3:0:0:0:0:0:0:0:0", endOnFailure: true }
Counterexample: [
  { items: [{ kind: "hot", sku: "P6-POTATO", title: "", filling: "potato",
              qty: 6, unitPriceCents: 50, addOns: [] }] },
  { profile: { tier: "guest" },
    delivery: { distanceKm: 0, zone: "local", rush: false },
    coupon: "FIRST10" }
]
Shrunk 8 time(s)
```

反例裡只剩一個最便宜的商品、沒有 add-ons、所有欄位都是預設值，唯一「縮不掉」的是 `coupon: "FIRST10"`，等於直接指出問題和這張 coupon 有關。隨機生成負責「找到」bug，shrinking 負責「解釋」bug。

輸出裡的 `seed` 和 `path` 可以傳回 `fc.assert(property, { seed, path })`，直接重播到同一個最小反例，對調查 CI 上的失敗很有幫助。

### 四種 property

設計 property 時，可以從幾個方向去想：

| 類型 | 檢查什麼 | PierogIO 的例子 |
| --- | --- | --- |
| Invariant | 不管輸入是什麼，輸出都必須滿足的條件 | 折扣介於 0 和 subtotal 之間；總價落在上下界之間 |
| Preservation | 從輸入推得的某個量在計算後要守恆 | 總價等於各項加總 |
| Metamorphic | 輸入做某種轉換後，輸出不變，或以可預測的方向、幅度改變 | 打亂商品順序總價不變；全冷凍訂單開啟 rush 剛好多 $2.99 |
| Differential（Success） | 合法輸入：正式實作和參考實作的輸出完全相同 | 正式實作和參考實作算出一樣的總價 |
| Differential（Failure） | 不合法輸入：正式實作和參考實作以相同方式失敗 | 未知的 tier 或負的數量，兩邊都丟出 `ValidationError` |

## fast-check 實作步驟

### 設計 generator：範圍決定你找得到什麼

Generator 指的是把各欄位的 arbitrary 組合成一份完整輸入的 arbitrary，它規範了各個欄位可以在什麼範圍內取值，因為 property 只能在 generator 產生得出來的輸入上發現 bug，所以 generator 本身就是 PBT 設計的一部分，以下是本文使用的 generator：

```js
const itemArb = fc.record({
  kind: fc.constantFrom('hot', 'frozen'),
  sku: fc.constantFrom('P6-POTATO', 'P12-POTATO', 'P24-POTATO', 'P6-SAUER'),
  title: fc.string(),
  filling: fc.constantFrom('potato', 'sauerkraut', 'sweet-cheese', 'mushroom'),
  qty: fc.constantFrom(6, 12, 24),
  unitPriceCents: fc.integer({ min: 50, max: 3000 }),
  addOns: fc.uniqueArray(
    fc.constantFrom('sour-cream', 'fried-onion', 'bacon-bits'),
    { maxLength: 3 }
  ),
});

const orderArb = fc.record({
  items: fc.array(itemArb, { minLength: 1, maxLength: 5 }),
});

const contextArb = fc.record({
  profile: fc.record({ tier: fc.constantFrom('guest', 'regular', 'vip') }),
  delivery: fc.record({
    distanceKm: fc.integer({ min: 0, max: 30 }),
    zone: fc.constantFrom('local', 'outer'),
    rush: fc.boolean(),
  }),
  coupon: fc.constantFrom(null, 'PIEROGI-BOGO', 'FIRST10'),
});
```

看起來只是把型別列出來，但要注意 arbitrary 中的限制會直接影響測試能力，像是價格範圍要覆蓋到「未達免運」的多商品訂單：如果 `unitPriceCents` 從 500（\$5）開始，每個商品折扣前至少 \$30，只要有兩個商品就至少 \$60，除了少數套用 BOGO 的組合，幾乎都會超過所有 tier 的免運門檻。下限改成 50（\$0.5）之後，未達免運的輸入空間才會被碰到。

另外，`sku`、`filling`、`qty` 是各自獨立產生的，所以可能出現 `P24-POTATO` 卻只有 6 入、餡料是 mushroom 的組合。計價規則不看 `sku`，這不影響測試結果。

### Property：實作需滿足的性質

**Invariant：每個輸出都必須成立的條件**

Invariant 最容易寫，只要問自己：「不管輸入是什麼，這個結果絕對不可能長什麼樣子？」對 PierogIO 來說，至少有四條。

1. 折扣必須介於 0 和 subtotal 之間

   這條能抓到的錯包括折扣率正負號寫反、volume discount 和 coupon 疊加後超過商品金額等等。前面 shrinking 的例子就是這條 property 的失敗輸出。

    ```js
    it('discount is between 0 and subtotal', () => {
      fc.assert(
        fc.property(orderArb, contextArb, (order, { profile, coupon }) => {
          const d = discounts(order, profile, coupon);
          return d >= 0 && d <= subtotal(order);
        })
      );
    });
    ```

2. 運費只能是幾個允許的值

   依照規則，運費只會是 0 或 zone 基本費，開啟 rush 時再加上 rush fee。不用算出正確答案，只要檢查結果在不在這個集合裡，這條能抓到「每個商品各收一次運費」、「rush fee 加了兩次」這類錯誤。上一節提到的價格範圍問題就是在這裡發揮作用：如果 generator 產生不出「多商品又要付運費」的訂單，第一種錯永遠不會暴露。

    ```js
    const ZONE_FEE = { local: 399, outer: 699 };
    const RUSH_FEE = 299;

    it('delivery fee is one of the allowed values', () => {
      fc.assert(
        fc.property(orderArb, contextArb, (order, ctx) => {
          const fee = deliveryFee(order, ctx);
          const rush = ctx.delivery.rush ? RUSH_FEE : 0;
          return fee === rush || fee === ZONE_FEE[ctx.delivery.zone] + rush;
        })
      );
    });
    ```

3. 有 hot item 的訂單一定要課稅

   這條能抓到 hot/frozen 的課稅條件寫反、或完全忘了課稅的錯。但它只確認稅金「大於 0」。如果實作忘了對運費課稅，稅金仍然大於 0，這條會通過；而且稅金只是少算，下一條的上下界也抓不到。這是 invariant 的局限：它只排除「不可能」的結果，不確認結果正確。這種錯要靠後面的 differential 來抓。

    ```js
    it('orders with hot items are taxed', () => {
      fc.assert(
        fc.property(orderArb, contextArb, (order, ctx) => {
          const hasHot = order.items.some((i) => i.kind === 'hot');
          return !hasHot || tax(order, ctx) > 0;
        })
      );
    });
    ```

4. 總價落在上下界之間

   不容易算出準確答案時，可以先算一個「一定要落在哪裡」的範圍。運費和稅都不會是負的，所以總價至少是「subtotal 減折扣」；運費最多是 outer zone 加 rush，稅最多是 8%，所以總價也有上限。

    ```js
    const MAX_DELIVERY = ZONE_FEE.outer + RUSH_FEE;

    it('total stays within bounds', () => {
      fc.assert(
        fc.property(orderArb, contextArb, (order, ctx) => {
          const sub = subtotal(order);
          const lower = sub - discounts(order, ctx.profile, ctx.coupon);
          const upper = Math.ceil((sub + MAX_DELIVERY) * 1.08);
          const t = total(order, ctx);
          return lower <= t && t <= upper;
        })
      );
    });
    ```

**Preservation：該守恆的要守恆**

Preservation 的問法是：「從輸入推得出來的哪個量，在計算過程中應該保持不變？」

1. 總價等於各項加總

   規則第 5 條直接給了一個守恆式：Total = Subtotal − Discounts + Delivery + Tax。`total()` 不應該在各項之外多加或少算任何東西。

   這條專門抓「組合」的錯。例如 rush fee 已經算在運費裡，`total()` 又自己加了一次；或是金額大到某個程度時，格式化、四捨五入的邏輯把數字弄壞。每個函式單獨看都對，組起來就重複或遺漏，正是[情境](#情境)一節提到的規則交互問題。

    ```js
    it('total is the sum of its parts', () => {
      fc.assert(
        fc.property(orderArb, contextArb, (order, ctx) => {
          const parts =
            subtotal(order) -
            discounts(order, ctx.profile, ctx.coupon) +
            deliveryFee(order, ctx) +
            tax(order, ctx);
          return total(order, ctx) === parts;
        })
      );
    });
    ```

**Metamorphic：輸入怎麼變，輸出就該怎麼變**

Metamorphic testing 的好處是：你不需要知道「正確答案是多少」，只需要知道「輸入做了這個轉換之後，兩個答案應該是什麼關係」，這個關係可以是「不變」、「差一個固定值」或「只會往某個方向變」。

1. 打亂商品順序，總價不變

   規則裡沒有任何一條提到商品順序，所以把購物車重新排列，總價應該一樣。這裡用 `.chain()` 先產生一張訂單，再產生同一組商品的一個隨機排列。

   這條對 coupon 特別有用。例如 BOGO 如果實作成「對迴圈中遇到的第二盒 6 入打半價」，哪一盒排在後面，折扣就會跟著變。

    ```js
    const orderWithShuffleArb = orderArb.chain((order) =>
      fc.tuple(
        fc.constant(order),
        fc.shuffledSubarray(order.items, {
          minLength: order.items.length,
          maxLength: order.items.length,
        })
      )
    );

    it('shuffling items does not change the total', () => {
      fc.assert(
        fc.property(orderWithShuffleArb, contextArb, ([order, shuffled], ctx) => {
          return total(order, ctx) === total({ items: shuffled }, ctx);
        })
      );
    });
    ```

2. 全冷凍訂單開啟 rush，總價剛好增加 $2.99

   這條能抓到 rush fee 重複計算、忘了計算，或是開啟 rush 意外影響到免運判斷的錯。只看全冷凍訂單，是因為有 hot item 時運費也要課稅，總價會多 $2.99 × 1.08；把所有商品改成 frozen，就能排除稅的影響。

    ```js
    it('rush adds exactly $2.99 to an all-frozen order', () => {
      fc.assert(
        fc.property(orderArb, contextArb, (order, ctx) => {
          const frozen = { items: order.items.map((i) => ({ ...i, kind: 'frozen' })) };
          const withRush = { ...ctx, delivery: { ...ctx.delivery, rush: true } };
          const noRush = { ...ctx, delivery: { ...ctx.delivery, rush: false } };
          return total(frozen, withRush) - total(frozen, noRush) === RUSH_FEE;
        })
      );
    });
    ```

3. 從 regular 升到 VIP，不會變貴

   VIP 的免運門檻比 regular 低，其他規則都跟 tier 無關，所以升級後總價只可能不變或變便宜。

    ```js
    it('upgrading regular -> vip never costs more', () => {
      fc.assert(
        fc.property(orderArb, contextArb, (order, ctx) => {
          const regular = { ...ctx, profile: { tier: 'regular' } };
          const vip = { ...ctx, profile: { tier: 'vip' } };
          return total(order, vip) <= total(order, regular);
        })
      );
    });
    ```

**Differential：拿另一個實作來對答案**

前面三類 property 檢查的是範圍、守恆式，或兩次執行之間的關係，都不直接確認結果的值對不對。Differential testing 則是寫一個簡單、好懂、不在乎效能的參考實作，要求它和正式實作：

- **Success**：對合法輸入算出一樣的答案
- **Failure**：對不合法輸入以一樣的方式失敗

參考實作要盡量簡單直白，讀起來應該和業務規則幾乎一對一。規則沒有細說的地方，就用 `Decision` 註解標出這份實作採用的解讀：

```js
// ZONE_FEE and RUSH_FEE are defined above.
const ADD_ON = { 'sour-cream': 99, 'fried-onion': 149, 'bacon-bits': 199 };
const FREE_AT = { guest: 5000, regular: 4000, vip: 3000 };
const COUPONS = [null, 'PIEROGI-BOGO', 'FIRST10'];

function invalid(message) {
  const error = new Error(message);
  error.name = 'ValidationError';
  throw error;
}

function referenceTotal(order, { profile, delivery, coupon = null }) {
  // Decision: unknown tier, zone or coupon, and non-positive qty are errors.
  if (!(profile.tier in FREE_AT)) invalid(`unknown tier: ${profile.tier}`);
  if (!(delivery.zone in ZONE_FEE)) invalid(`unknown zone: ${delivery.zone}`);
  if (!COUPONS.includes(coupon)) invalid(`unknown coupon: ${coupon}`);
  for (const i of order.items) {
    if (!(Number.isInteger(i.qty) && i.qty > 0)) invalid(`bad qty: ${i.qty}`);
  }

  // Decision: add-ons are priced per pierogi, like unitPriceCents.
  const lines = order.items.map((i) => ({
    ...i,
    base: i.unitPriceCents * i.qty,
    full: (i.unitPriceCents + i.addOns.reduce((s, a) => s + ADD_ON[a], 0)) * i.qty,
  }));
  const subtotal = lines.reduce((s, l) => s + l.full, 0);

  // Decision: volume discount is 5% / 10% for every tier, on the base price only.
  let discount = lines.reduce((s, l) =>
    s + (l.qty >= 24 ? Math.floor(l.base * 0.10)
       : l.qty >= 12 ? Math.floor(l.base * 0.05) : 0), 0);

  // Decision: BOGO applies once, to the cheaper 6-pack of a same-filling pair.
  if (coupon === 'PIEROGI-BOGO') {
    let best = 0;
    for (const f of new Set(lines.map((l) => l.filling))) {
      const sixes = lines
        .filter((l) => l.qty === 6 && l.filling === f)
        .map((l) => l.base)
        .sort((a, b) => b - a);
      if (sixes.length >= 2) best = Math.max(best, Math.floor(sixes[1] * 0.5));
    }
    discount += best;
  }
  // Decision: FIRST10 threshold is checked on the subtotal before any discount.
  if (coupon === 'FIRST10' && subtotal >= 2000) discount += Math.floor(subtotal * 0.10);

  // Decision: the free-delivery threshold uses subtotal minus ALL discounts.
  const discounted = subtotal - discount;
  const base = discounted >= FREE_AT[profile.tier] ? 0 : ZONE_FEE[delivery.zone];
  const deliveryFee = base + (delivery.rush ? RUSH_FEE : 0);

  // Decision: tax is 8% of hot lines (before discounts) plus the whole delivery fee.
  const hasHot = lines.some((l) => l.kind === 'hot');
  const hotAmount = lines.filter((l) => l.kind === 'hot').reduce((s, l) => s + l.full, 0);
  const tax = hasHot ? Math.round((hotAmount + deliveryFee) * 0.08) : 0;

  return subtotal - discount + deliveryFee + tax;
}
```

這個參考實作也應該通過前面所有的 property。跑一次是確認參考實作自己沒寫錯的便宜方法。

1. Success：合法輸入的輸出一致

    ```js
    it('total agrees with the reference on valid input', () => {
      fc.assert(
        fc.property(orderArb, contextArb, (order, ctx) => {
          expect(total(order, ctx)).toBe(referenceTotal(order, ctx));
        })
      );
    });
    ```

2. Failure：不合法輸入的錯誤一致

   這時候需要一個專門產生「壞輸入」的 generator。用 `fc.oneof` 把幾種壞法組合起來，每種都是從合法輸入 `.map()` 出來的。

   Failure 這條容易被忽略，但它抓的是最危險的一類錯：實作遇到不認得的 tier 時不報錯，而是默默當成 guest 處理，客人就被收了錯的價錢，而且沒有任何人知道。

    ```js
    const invalidCaseArb = fc.oneof(
      fc.tuple(orderArb, contextArb.map((c) => ({ ...c, profile: { tier: 'gold' } }))),
      fc.tuple(orderArb, contextArb.map((c) => ({ ...c, delivery: { ...c.delivery, zone: 'mars' } }))),
      fc.tuple(orderArb, contextArb.map((c) => ({ ...c, coupon: 'FREE-PIEROGI' }))),
      fc.tuple(
        orderArb.map((o) => ({ items: o.items.map((i) => ({ ...i, qty: -i.qty })) })),
        contextArb
      )
    );

    const outcome = (fn) => {
      try {
        return { ok: fn() };
      } catch (e) {
        return { error: e.name };
      }
    };

    it('total rejects invalid input the same way as the reference', () => {
      fc.assert(
        fc.property(invalidCaseArb, ([order, ctx]) => {
          const actual = outcome(() => total(order, ctx));
          const expected = outcome(() => referenceTotal(order, ctx));
          return actual.error !== undefined && actual.error === expected.error;
        })
      );
    });
    ```

## Property-based Testing 的限制

PBT 很強，但它不是 example-based 測試的替代品。下面是我覺得最值得注意的幾個限制。

### 單一 property 通過，不代表實作正確

假設有人把 `total()` 寫成 `() => 0`。「打亂順序總價不變」和「升 VIP 不會變貴」都會通過，因為 0 等於 0。Metamorphic property 只約束兩次執行之間的關係，不約束絕對值。這個例子在總價下界和 preservation 上會失敗，但那是因為有其他 property 補位：單一一條 property 通常很弱，要多條互相補位，再搭配幾個 example-based 測試或 differential testing，把絕對值錨定住。

### 隨機幾乎打不到業務邊界

免運規則是「≥ 門檻」。如果實作寫成「> 門檻」，只有折扣後 subtotal 剛好等於 \$30.00、\$40.00 或 \$50.00 的訂單才會暴露問題。我用本文的 generator 抽了 10 萬張訂單，只有 1 張剛好落在門檻上。

fast-check 會偏向產生範圍的極值（`min`、`max`、接近 0 的數），但它不知道 \$50 對你的業務有意義。一種解法是寫一個專門的 generator，把輸入空間縮小到邊界附近。例如只產生「單一 6 入、每顆 \$4.00–\$6.00、VIP」的訂單，大約每 200 組才會出現一次剛好 \$30.00 的情況。對這種已知的邊界，直接寫一個 example-based 測試反而最有效率。

這和「設計 generator」一節的價格範圍問題是同一件事：PBT 的覆蓋率取決於 generator 的分佈，而且沒有任何錯誤訊息會告訴你「這個區域沒測到」。`fc.statistics` 可以印出 generator 產生的輸入分佈，是檢查 generator 的好工具。

### Shrinking 只找到局部最小

Shrinking 只會往「更小」走。如果 bug 要在總價很高時才會發生，而價格已經先被縮小，反例就可能保留一些不相關的細節（幾個 add-ons、一張 coupon）來湊金額。任何一個都拿不掉，因為拿掉之後必須把價格調高，而 shrinker 不會這樣做。所以看到反例時，要分辨哪些細節是 bug 的本質，哪些只是 shrinking 的殘留。

### Oracle problem

Differential testing 的參考實作是自己寫的。如果你對規格的理解和實作者犯了同樣的錯，兩邊會一致地錯，測試照樣通過。參考實作越簡單，這個風險越低，但它終究只是「另一份對規格的解讀」，不是真理，而且需要跟著規格一起維護。

### 執行成本與非確定性

`fc.assert` 預設每條 property 跑 100 組輸入。純函式的話只要幾毫秒，但如果每次呼叫都要碰資料庫或 API，成本就會快速變高。另外，每次執行的 seed 不同，同一個 bug 可能這次抓到、下次沒抓到。CI 上要記得保留失敗時印出的 `seed` 和 `path`，才能重現。

## 總結

四種 property 各有擅長抓的錯，也各有盲點，所以它們是互補的，不是二選一：

| 類型 | 擅長抓的錯 | 盲點 |
| --- | --- | --- |
| Invariant | 符號寫反、不該出現的值、忘了套用某條規則、單位錯誤或溢位 | 結果「合理但錯誤」時抓不到 |
| Preservation | 重複或遺漏某一項 | 各項自己算錯時抓不到 |
| Metamorphic | 順序依賴、參數互相干擾、該單調的關係不單調 | 對絕對值沒有約束 |
| Differential | 所有與參考實作不一致的細節，包括錯誤處理 | 參考實作和正式實作犯同樣的錯時抓不到 |

回頭看，PBT 把測試的問題從「要挑哪些輸入」換成「什麼事情一定要成立」。後者看起來比較抽象，但實際上更接近業務規則的原本樣貌，整個過程也更像在設計而不是在列清單。

如果要在自己的專案開始用，我會建議這個順序：

1. 先寫 invariant，成本最低，也最容易抓到明顯的錯
2. 找出規則裡的守恆式，寫成 preservation
3. 找 metamorphic 關係，尤其是「這個參數不該影響結果」和「這個參數只能讓結果往某個方向變」
4. 規則夠清楚、又值得投資時，寫一個參考實作，同時測 success 和 failure 兩種情況
5. 保留幾個 example-based 測試，把已知的邊界和絕對值錨定住
