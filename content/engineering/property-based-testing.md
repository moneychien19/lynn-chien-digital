---
title: Testing Complex Business Rules with Property-based Testing
---

> 中文版：[[zh/engineering/property-based-testing|用 Property-based Testing 測試複雜業務規則]]

## TL;DR

When should we use Property-based Testing (PBT), and how do we design properties? When a business rule has too many input combinations and its parts affect each other, hand-written test cases can't cover it all. Instead, we can ask "whatever the input is, what must always hold?" and let fast-check generate a large number of random inputs to check it. When a check fails, fast-check also shrinks the counterexample down to a minimal one. Using the order pricing rules of PierogIO as an example, this post covers four directions for designing properties, how the range of a generator affects what tests can find, and the limits of PBT.

## Scenario

Given a complex business rule, how can we test it?

Take [PierogIO](https://github.com/CMU-623/PierogIO), a (fictional) pierogi delivery platform in Pittsburgh. Its order pricing rules are:

1. Subtotal: item prices plus add-ons (sour cream \$0.99, fried onion \$1.49, bacon bits \$1.99)
2. Discounts: 5% off 12-packs, 10% off 24-packs, plus a coupon (`PIEROGI-BOGO`: second 6-pack of the same filling at half price; `FIRST10`: 10% off orders of \$20 or more)
3. Delivery: a base fee by zone (local \$3.99, outer \$6.99), free when the discounted subtotal reaches a threshold (guest \$50, regular \$40, VIP \$30), plus \$2.99 for rush
4. Tax: 8% on hot items only, frozen items are tax-free; when an order has a hot item, the delivery fee is taxed too
5. Total = Subtotal − Discounts + Delivery + Tax

With traditional example-based tests, we could in theory design test cases from the boundary values or representative values of each field. In practice, writing those cases runs into two problems:

1. **Combinatorial explosion**: an order item can be hot or frozen, has four fillings, three quantities, and any combination of add-ons; the whole order then multiplies that by coupon, zone, tier, and rush. Even picking one or two representative values per dimension leads to far too many tests.
2. **Rules affect each other**: the free-delivery threshold looks at the *discounted* subtotal, so a bug in the discount rules also makes the delivery fee wrong; whether delivery is taxed depends on whether there's a hot item, so tax and delivery are tied together. Every function can be correct on its own and still be wrong when combined, and this kind of interaction is exactly what example-based tests miss most easily.

This is where Property-based Testing helps.

## A Quick Introduction to PBT and fast-check

An example-based test (the technique most unit tests use) says "given this input, expect this output". PBT says "for every valid input, this property must hold", and the framework generates many random inputs to check it. The idea comes from Haskell's QuickCheck; [fast-check](https://fast-check.dev/) is the main implementation in the JavaScript/TypeScript ecosystem and works with test frameworks like Vitest and Jest.

A fast-check test has three parts:

- **Arbitrary**: describes the input space, for example `fc.integer({ min: 0 })` or `fc.constantFrom('hot', 'frozen')`. You can combine them into complex objects with `fc.record` and `fc.array`
- **Property**: `fc.property(arb1, arb2, …, predicate)`. The property fails if the predicate returns `false` or throws
- **Runner**: `fc.assert(property)` runs 100 random inputs by default and fails the test if any one of them fails

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

### Shrinking: reducing the counterexample to a minimum

A randomly generated failing input is usually big and messy: five items, all sorts of add-ons, odd prices. After fast-check finds a failing input, it automatically tries "simpler" candidates (removing elements from arrays, moving integers toward the lower bound, moving `constantFrom` toward its first value). As long as a candidate still fails, it keeps shrinking, until any further step would make the test pass. This process is called **shrinking**.

Suppose the implementation has a bug in the `FIRST10` coupon: it doesn't check the \$20 threshold, and it takes a flat \$10 off instead of 10%. When the discount property below fails, fast-check prints something like this:

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

The counterexample has only one item at the lowest price, no add-ons, and every field at its default. The only thing that "won't shrink away" is `coupon: "FIRST10"`, which points straight at that coupon. Random generation *finds* the bug; shrinking *explains* it.

The `seed` and `path` in the output can be passed back as `fc.assert(property, { seed, path })` to replay the same minimal counterexample, which is very useful when investigating a failure on CI.

### Four kinds of property

When designing properties, you can think in a few directions:

| Kind | What it checks | PierogIO example |
| --- | --- | --- |
| Invariant | A condition every output must satisfy, whatever the input | The discount is between 0 and the subtotal; the total is between a lower and an upper bound |
| Preservation | A quantity derived from the input is conserved through the computation | The total equals the sum of its parts |
| Metamorphic | After some transformation of the input, the output stays the same or changes in a predictable direction or amount | Shuffling items doesn't change the total; turning on rush for an all-frozen order adds exactly \$2.99 |
| Differential (Success) | Valid input: the production implementation and a reference implementation give exactly the same output | Both implementations compute the same total |
| Differential (Failure) | Invalid input: the production implementation and a reference implementation fail the same way | For an unknown tier or a negative quantity, both throw `ValidationError` |

## Implementing It with fast-check

### Designing the generator: its range decides what you can find

A generator is an arbitrary that combines the arbitraries of each field into one complete input. It defines the range each field can take. Because a property can only find bugs on inputs the generator can produce, the generator itself is part of PBT design. Here is the generator used in this post:

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

It looks like a list of types, but the constraints in the arbitraries directly affect what the tests can find. For example, the price range has to reach multi-item orders that *don't* qualify for free delivery. If `unitPriceCents` started at 500 (\$5), every item would be at least \$30 before discounts, and any two items would be at least \$60. Apart from a few combinations with BOGO, that is above the free-delivery threshold for every tier. Only after lowering the minimum to 50 (\$0.5) does the generator reach the part of the input space that pays for delivery.

Also, `sku`, `filling`, and `qty` are generated independently, so you can get a `P24-POTATO` with only 6 pieces and a mushroom filling. The pricing rules don't look at `sku`, so this doesn't affect the results.

### Properties: what the implementation must satisfy

**Invariant: conditions every output must satisfy**

Invariants are the easiest to write. Just ask yourself: "Whatever the input, what can this result never look like?" PierogIO has at least four.

1. The discount must be between 0 and the subtotal

   This catches bugs such as a flipped sign on a discount rate, or a volume discount and a coupon stacking past the item total. The shrinking example above is the failure output of this property.

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

2. The delivery fee can only take a few allowed values

   By the rules, the delivery fee is either 0 or the zone base fee, plus the rush fee when rush is on. We don't need to compute the right answer, only check whether the result is in this set. This catches bugs like "charging delivery once per item" or "adding the rush fee twice". The price range issue from the previous section matters here: if the generator can't produce an order with several items that still pays for delivery, the first bug will never show up.

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

3. An order with a hot item must be taxed

   This catches a swapped hot/frozen tax condition, or forgetting tax entirely. But it only checks that the tax is "greater than 0". If the implementation forgets to tax the delivery fee, the tax is still greater than 0 and this property passes; and since the tax is only too low, the bounds in the next property won't catch it either. This is the limit of invariants: they rule out "impossible" results but don't confirm that a result is correct. This kind of bug needs the differential test later on.

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

4. The total is between a lower and an upper bound

   When the exact answer is hard to compute, you can first compute a range it must fall in. Delivery and tax are never negative, so the total is at least "subtotal minus discounts"; delivery is at most the outer zone fee plus rush, and tax is at most 8%, so the total has an upper bound too.

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

**Preservation: what should be conserved stays conserved**

The question for preservation is: "Which quantity derived from the input should stay the same through the computation?"

1. The total equals the sum of its parts

   Rule 5 gives a conservation equation directly: Total = Subtotal − Discounts + Delivery + Tax. `total()` shouldn't add or drop anything beyond those parts.

   This property targets bugs in how the parts are *combined*. For example, the rush fee is already included in delivery, but `total()` adds it again; or once amounts get large enough, formatting or rounding logic breaks the number. Every function looks right on its own, but combined they double-count or drop something, which is exactly the rule interaction problem from the [Scenario](#scenario) section.

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

**Metamorphic: as the input changes, the output should change accordingly**

The nice thing about metamorphic testing is that you don't need to know "what the right answer is". You only need to know "after this transformation of the input, how the two answers should relate". The relation can be "unchanged", "differs by a fixed amount", or "only moves in one direction".

1. Shuffling the items doesn't change the total

   No rule mentions item order, so rearranging the cart should give the same total. Here `.chain()` first generates an order, then generates a random permutation of the same items.

   This is especially useful for coupons. For example, if BOGO is implemented as "half price on the second 6-pack the loop encounters", the discount changes depending on which pack comes later.

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

2. Turning on rush for an all-frozen order adds exactly \$2.99

   This catches the rush fee being counted twice, being forgotten, or turning on rush accidentally affecting the free-delivery decision. It only looks at all-frozen orders because when there's a hot item, delivery is taxed too and the total goes up by \$2.99 × 1.08; making every item frozen removes the effect of tax.

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

3. Upgrading from regular to VIP never costs more

   VIP has a lower free-delivery threshold than regular, and no other rule depends on tier, so after upgrading the total can only stay the same or go down.

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

**Differential: checking answers against another implementation**

The three kinds of property above check ranges, conservation equations, or relations between two runs; none of them directly checks that the result's value is correct. Differential testing instead means writing a simple, easy-to-read reference implementation that doesn't care about performance, and requiring it to match the production implementation:

- **Success**: compute the same answer for valid input
- **Failure**: fail the same way for invalid input

The reference implementation should be as plain as possible and read almost one-to-one with the business rules. Where the rules leave details open, mark the interpretation this implementation takes with a `Decision` comment:

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

This reference implementation should also pass every property above. Running them once is a cheap way to confirm the reference itself isn't wrong.

1. Success: the same output for valid input

    ```js
    it('total agrees with the reference on valid input', () => {
      fc.assert(
        fc.property(orderArb, contextArb, (order, ctx) => {
          expect(total(order, ctx)).toBe(referenceTotal(order, ctx));
        })
      );
    });
    ```

2. Failure: the same error for invalid input

   This needs a generator dedicated to producing "bad input". `fc.oneof` combines several ways of breaking the input, each one derived from valid input with `.map()`.

   The failure case is easy to overlook, but it catches the most dangerous kind of bug: an implementation that sees an unknown tier and, instead of raising an error, quietly treats it as guest. The customer is charged the wrong price, and nobody ever finds out.

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

## Limits of Property-based Testing

PBT is powerful, but it doesn't replace example-based tests. Below are the limits I think matter most.

### One passing property doesn't mean the implementation is correct

Suppose someone writes `total()` as `() => 0`. "Shuffling doesn't change the total" and "upgrading to VIP never costs more" both pass, because 0 equals 0. Metamorphic properties only constrain the relation between two runs, not absolute values. This example does fail the lower bound and the preservation property, but only because other properties cover the gap: a single property is usually weak, so you need several that cover for each other, plus a few example-based tests or differential testing to pin down the absolute values.

### Random inputs almost never hit business boundaries

The free-delivery rule is "≥ threshold". If the implementation uses "> threshold", only orders whose discounted subtotal is exactly \$30.00, \$40.00, or \$50.00 reveal the bug. I drew 100,000 orders from this post's generator, and only 1 landed exactly on a threshold.

fast-check is biased toward the extremes of a range (`min`, `max`, numbers close to 0), but it doesn't know that \$50 means something to your business. One fix is to write a dedicated generator that narrows the input space to the area around the boundary. For example, generating only "a single 6-pack, \$4.00–\$6.00 per piece, VIP" orders gives exactly \$30.00 about once every 200 inputs. For a boundary you already know about, writing an example-based test directly is the most efficient option.

This is the same issue as the price range in the generator design section: PBT's coverage depends on the generator's distribution, and no error message will tell you "this region wasn't tested". `fc.statistics` can print the distribution of inputs a generator produces, which makes it a good tool for checking generators.

### Shrinking only finds a local minimum

Shrinking only moves toward "smaller". If a bug only happens when the total is high, and the price has already been shrunk, the counterexample may keep some irrelevant details (a few add-ons, a coupon) to make up the amount. None of them can be removed, because removing one would require raising the price, and the shrinker doesn't do that. So when you look at a counterexample, you have to tell which details are essential to the bug and which are just leftovers from shrinking.

### The oracle problem

The reference implementation for differential testing is written by you. If your understanding of the spec has the same mistake as the implementer's, both sides are wrong in the same way and the test still passes. The simpler the reference implementation, the lower this risk, but it is still just "another interpretation of the spec", not the truth, and it has to be maintained alongside the spec.

### Running cost and non-determinism

`fc.assert` runs 100 inputs per property by default. For pure functions that takes a few milliseconds, but if each call touches a database or an API, the cost grows quickly. Also, each run uses a different seed, so the same bug might be caught this time and missed the next. On CI, remember to keep the `seed` and `path` printed on failure so you can reproduce it.

## Summary

Each of the four kinds of property is good at catching certain bugs and has its own blind spots, so they complement each other rather than compete:

| Kind | Good at catching | Blind spot |
| --- | --- | --- |
| Invariant | Flipped signs, values that should never appear, a rule that wasn't applied, unit errors or overflow | Results that are "plausible but wrong" |
| Preservation | A part that is double-counted or dropped | A part that is computed wrong on its own |
| Metamorphic | Order dependence, parameters interfering with each other, relations that should be monotonic but aren't | No constraint on absolute values |
| Differential | Any detail that differs from the reference, including error handling | The reference and production implementations making the same mistake |

Looking back, PBT changes the testing question from "which inputs should I pick?" to "what must always hold?". The second looks more abstract, but it is actually closer to what the business rules really say, and the whole process feels more like design than like making a list.

If you want to start using it in your own project, I'd suggest this order:

1. Write invariants first: they cost the least and catch obvious bugs most easily
2. Find the conservation equations in the rules and write them as preservation properties
3. Look for metamorphic relations, especially "this parameter shouldn't affect the result" and "this parameter can only move the result in one direction"
4. When the rules are clear enough and worth the investment, write a reference implementation and test both success and failure cases
5. Keep a few example-based tests to pin down known boundaries and absolute values
