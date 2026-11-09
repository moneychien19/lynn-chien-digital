---
title: 'Seeing Cache Step by Step: A Cache Visualization Simulator'
---

> 中文版：[[zh/engineering/cache-simulator|一步一步看懂 Cache：Cache 可視化模擬器]]

When working through the CSAPP cache lab or a computer architecture cache assignment, the concepts are rarely what takes the most time. The hand calculation is: splitting a list of hex addresses into tag, set, and offset, drawing the cache lines in every set, tracking LRU, and deciding whether each miss is cold, conflict, or capacity. One mistake early on and everything after it is wrong.

So I built a tool: the [Cache Visualization Simulator](https://moneychien19.github.io/cache-simulator/) ([GitHub](https://github.com/moneychien19/cache-simulator)). Give it a cache configuration and a sequence of memory accesses, and it plays back, step by step, what happens on each access.

This post has two parts. The first walks through how a cache works. The second introduces the tool and uses it to run the examples from the first part.

## How a Cache Works

### Why we need a cache

CPUs are fast; main memory (DRAM) is comparatively slow. Register access is nearly free and an L1 cache hit takes a few cycles, but a single DRAM access can take hundreds of cycles. If every load went straight to main memory, the CPU would spend most of its time waiting.

A cache is a small, fast memory that sits between the CPU and main memory and holds data that is likely to be used soon. It works because programs usually exhibit **locality**:

- **Temporal locality**: data that was just used is likely to be used again soon, such as a loop counter or an accumulator.
- **Spatial locality**: after accessing an address, a program is likely to access nearby addresses soon, such as when iterating over an array.

A cache is designed around both. It keeps recently used data (temporal locality), and when it fetches from main memory, it brings in a whole chunk of adjacent bytes rather than a single byte (spatial locality). That chunk is called a **block**.

### Cache organization: S, E, B

CSAPP describes a cache with three parameters:

- **S = $2^s$**: the number of sets
- **E**: the number of lines per set (also called the associativity)
- **B = $2^b$**: the number of bytes in the block each line holds

Besides the block data, each line has a **valid bit** (whether the line holds anything) and a **tag** (which block it holds). The total capacity of the cache is:

```
C = S × E × B
```

Depending on E, a cache falls into one of three organizations:

| Type | Setting | Description |
|---|---|---|
| **Direct-mapped** | E = 1 | One line per set; each block has exactly one place it can go |
| **E-way set-associative** | 1 < E < C/B | Each block maps to one set, but can go in any line within that set |
| **Fully-associative** | S = 1 | A single set; any block can go in any line |

Direct-mapped is the simplest and cheapest in hardware, but it is the most prone to two blocks fighting over the same slot. Fully-associative is the most flexible, but every lookup must compare against every line's tag, which is expensive in hardware, so in practice it is only used for very small caches.

### How an address finds its place

Given an m-bit memory address, the cache splits it into three fields:

```
| tag (t bits) | set index (s bits) | block offset (b bits) |
```

- **block offset**: the lowest b bits, the byte position within the block
- **set index**: the next s bits, which set the block belongs to
- **tag**: the remaining t = m − s − b bits, identifying which block it is within the set

For example, take a cache with s = 2, E = 1, b = 4: 4 sets, direct-mapped, 16-byte blocks, 64 bytes in total. The address to access is `0x1321`:

```
0x1321 = 0001 0011 0010 0001

         0001 0011 00 | 10 | 0001
              tag     | set| offset
```

- offset = `0001` = 1
- set = `10` = 2
- tag = `0001001100` = `0x4C`

So this access goes to set 2 and looks for a line with tag `0x4C`. If there is one, it reads byte 1 of that block.

### Hits, misses, and replacement

Once the address is split, the lookup goes like this:

1. Use the **set index** to find the set
2. Among the lines in that set, look for one whose valid bit is 1 and whose tag matches
3. If found, it is a **hit**, and the offset selects the data; otherwise it is a **miss**

On a miss, the cache fetches the whole block from the next level of memory and places it in the set. If the set has an empty line, the block goes there; if the set is full, one line must be removed (**eviction**). The most common choice is **LRU (Least Recently Used)**: evict the line that has gone unused the longest.

There are three kinds of memory operations:

- **L (Load)**: read
- **S (Store)**: write
- **M (Modify)**: read then write, such as `x++`, equivalent to one L followed by one S

### Write policies on hit and miss

Reads are simple: on a hit, take the data from the cache; on a miss, bring the block in. Writes raise an extra question: once the data in the cache changes, the copy in the next level of memory is stale, so how do the two stay consistent? There are two common policies for a write hit and two for a write miss:

- On a write hit:
  - write-through: write the data to memory immediately
  - write-back: update only the block in the cache and set its dirty bit to 1; write the whole block back to memory only when the line is evicted, then clear the dirty bit to 0
- On a write miss:
  - write-allocate: load the block from memory into the cache first, then update the cache
  - no-write-allocate: write directly to memory without loading the block into the cache

In practice, write-back is usually paired with write-allocate, and write-through with no-write-allocate. The first pairing reduces writes to memory and bets that a block just written will be used again soon; the second is simpler to implement but touches memory on every write. Both the CSAPP cache lab and this tool use write-back + write-allocate, so besides tags and LRU order, you also have to track each line's dirty bit.

### The three kinds of misses (3C)

Misses fall into three categories by cause, known as the 3Cs:

- **Cold miss (compulsory miss)**: the block has never been accessed before. The first access always misses, no matter how large the cache is.
- **Capacity miss**: the data the program needs at once exceeds the cache's capacity; even a fully-associative cache could not hold it.
- **Conflict miss**: the cache actually has room, but the block can only go in a particular set, and that set is full of other blocks, so it gets evicted.

Cold misses are easy to identify: just check whether the block has appeared before. The hard part is conflict versus capacity. In both cases the block was seen earlier and then evicted, so how do you tell whether the set ran out of room or the whole cache did?

The standard method is to use a **fully-associative LRU cache of the same total size** as a reference:

- If the reference cache also misses, the block would not fit even with complete freedom of placement, so it is a **capacity miss**
- If the reference cache hits, there was enough room overall and the block was only pushed out by set mapping, so it is a **conflict miss**

### How you write code affects the hit rate

Cache behavior is not only a concern for hardware designers. The same computation, written differently, can have a dramatically different hit rate.

The classic example is the traversal order of a 2D array. C stores 2D arrays in **row-major** order: `a[i][j]` and `a[i][j+1]` are adjacent in memory, while `a[i][j]` and `a[i+1][j]` are a whole row apart.

```c
// Row by row: follows the memory layout
for (int i = 0; i < N; i++)
  for (int j = 0; j < N; j++)
    sum += a[i][j];

// Column by column: jumps a whole row each time
for (int j = 0; j < N; j++)
  for (int i = 0; i < N; i++)
    sum += a[i][j];
```

When traversing by row, the next few elements all come from the block that one miss brought in, so spatial locality is good. When traversing by column, every access jumps to a different block. If the cache is too small or the set mapping is unlucky, a block may be evicted before its second element is ever used.

But what exactly happens in that "may"? Conflict or capacity? Would a different cache configuration help? These questions are hard to answer by imagination alone, so let's run them through the tool.

## The Cache Visualization Simulator

### What problem the tool solves

Working cache problems by hand has a few pain points:

1. Splitting addresses into tag / set / offset
2. Drawing cache lines, tracking LRU and dirty bits, and classifying 3C misses (which also means simulating a reference cache to decide whether a miss is capacity)

The tool does all of this for you and lets you **step forward and backward** like a slide deck, watching how the cache changes before and after each access. It does not just give you the final answer; it shows the reasoning at every step, which makes it useful both for checking your work and for building intuition.

The tool runs right in the browser: <https://moneychien19.github.io/cache-simulator/>

<!-- TODO: screenshot of the full tool -->

### How to use it

**1. Configure the cache**

Enter the three parameters `s`, `E`, and `b`, or pick a preset:

- **Cache 1 — direct-mapped**: s = 2, E = 1, b = 4
- **Cache 2 — fully associative**: s = 0, E = 4, b = 4

Both presets hold 64 bytes in total (4 lines × 16 bytes) and differ only in organization, which makes them good for comparison.

**2. Enter memory accesses**

There are two input modes.

The first is a **typed trace**, in a format similar to the CSAPP cache lab trace files:

```
L 0x1321
S 0x1756
M 0x1644,4   # optional size; everything after # is a comment
```

- Supported operations are `L`, `S`, and `M` (`M` expands into one L and one S)
- Addresses can be written with or without `0x`
- `,size` is optional
- Everything after `#` is a comment

The second is **pasting C code**. The tool interprets a subset of C and generates the memory access sequence from the array indexing. Supported syntax includes:

- Scalar and 1D/2D array declarations of `int`, `long`, `size_t`, `double`, `float`, and `char`
- Nested `for`, `if` / `else`
- `=`, `+=`, `i++`
- Arithmetic `+ - * / %`, comparisons, and logical `&& || !`

Scalars are treated as living in registers and generate no memory accesses; only array element reads and writes produce an L or S. Arrays are laid out contiguously starting at address 0 in declaration order, with element size determined by type (for example, `int` is 4 bytes and `double` is 8 bytes).

This means textbook questions like "which loop order has a better hit rate" no longer require translating the program into a list of addresses first. Just paste it in and see the result.

**3. Step through the playback**

After running, use the previous / next / reset / end buttons, or the ← → keys, to move one access at a time. The result table below lists the outcome of every access; click any row to jump to that step.

**4. What each panel shows**

- **Address breakdown**: the current access's address in binary, with tag, set, and offset in three colors
- **Cache grid**: every line of every set, marked with MRU / LRU and the dirty bit, highlighting the line that was hit, filled, or evicted on this step
- **Reference cache panel**: the blocks currently held by the same-size fully-associative reference cache, which is the basis for classifying conflict versus capacity
- **Running totals**: the number of hits and of each miss type up to the current step

<!-- TODO: screenshot of the address breakdown and cache grid -->

### Example 1: one trace, two caches

Start with the tool's default trace. With Cache 1 (direct-mapped) selected, the result is:

| # | Access | tag | set | Result |
|---|---|---|---|---|
| 1 | L 0x1321 | 0x4C | 2 | cold |
| 2 | L 0x1A04 | 0x68 | 0 | cold |
| 3 | S 0x1756 | 0x5D | 1 | cold |
| 4 | S 0x1644 | 0x59 | 0 | cold |
| 5 | L 0x1A0C | 0x68 | 0 | conflict |
| 6 | S 0x164C | 0x59 | 0 | conflict |
| 7 | L 0x1E21 | 0x78 | 2 | cold |
| 8 | S 0x132E | 0x4C | 2 | capacity |
| 9 | L 0x164E | 0x59 | 0 | hit |

Step 5 is a textbook case: `0x1A0C` is in the same block as `0x1A04` from step 2, but `0x1644` in step 4 also maps to set 0 and, in a direct-mapped cache, evicted it. At this point the cache has only seen 3 blocks and the reference cache still holds this one, so it is a **conflict miss**. Step 6 is the same situation in reverse.

Step 8 is different. `0x132E` is in the same block as `0x1321` from step 1, but by now 5 distinct blocks have been used, more than the 4 lines available, and the reference cache has already evicted it under LRU. So it is a **capacity miss**.

Switch to Cache 2 (fully-associative, same total size), and the same trace yields 3 hits, 5 cold misses, and 1 capacity miss. Both conflict misses have turned into hits, while the capacity miss remains. This is exactly what the 3C definitions predict: conflict misses come from set mapping and disappear with full associativity; capacity misses come from too little space, and no change of organization will fix them.

### Example 2: loop order

Back to the loop example from Part 1. Paste this into C code mode:

```c
int a[8][8];
int sum = 0;

for (int i = 0; i < 8; i++) {
  for (int j = 0; j < 8; j++) {
    sum += a[i][j];
  }
}
```

`a` is 8 × 8 `int`s, 256 bytes in total, with 32 bytes per row. First set the cache to s = 3, E = 1, b = 4: 8 sets, direct-mapped, 16-byte blocks, 128 bytes in total, enough for only half the array.

When traversing by row, each block holds 4 `int`s, so out of every 4 accesses only the first is a cold miss and the other 3 hit. Across 64 accesses there are **16 cold misses and 48 hits**, a 75% hit rate.

Swap the two loops to traverse by column, and the result becomes **16 cold misses, 48 conflict misses, and 0 hits**.

Stepping through shows why: within one column, the address of `a[i][j]` grows by 32 bytes each time, skipping 2 blocks. The 8 rows map to only four sets, 0, 2, 4, and 6, with two rows competing for each set and evicting each other over and over. By the time the next column is visited, the blocks brought in earlier are long gone.

But the reference cache panel tells you something else: one column uses only 8 blocks, which fit exactly in the 8 lines of a fully-associative cache. So every one of these misses is a **conflict miss**: there was enough capacity, and set mapping is what went wrong.

Now shrink the cache to s = 2, E = 1, b = 4 (4 sets, 64 bytes in total). Traversing by column now gives **16 cold misses and 48 capacity misses**. This time even the reference cache has only 4 lines and cannot hold the 8 blocks a column needs, so the misses change from conflict to capacity. Traversing by row still gives a 75% hit rate.

Same program, same traversal order, same number of misses, but different causes, and different ways to improve: conflict misses can be fixed by raising associativity or changing how data is laid out, while capacity misses can only be fixed with a bigger cache or by reordering the computation so that less data is in use at any given time. The latter is exactly the idea behind optimizations like **blocking**.

The tool's default C code is a 4 × 4 matrix transpose, `B[j][i] = A[i][j]`, which reads by row and writes by column at the same time. It is another good one to try with different configurations.

<!-- TODO: step-by-step screenshot or GIF of the column-major run in Example 2 -->

## Conclusion

The ideas behind a cache are not complicated: split the address, find the set, compare tags, replace with LRU, and classify misses against a reference cache. What makes it hard by hand is repeating these steps many times while tracking a lot of state at once. This tool hands the mechanical work to the program, so your attention can go back to the questions that matter: why did this step miss, and what would change with different code or a different configuration?

The tool currently supports only LRU, a single cache level, and write-back. Possible extensions include other replacement policies, multi-level caches, and different write policies. If you are working on the cache lab, or want a more concrete intuition for how caches behave, [give it a try](https://moneychien19.github.io/cache-simulator/).
