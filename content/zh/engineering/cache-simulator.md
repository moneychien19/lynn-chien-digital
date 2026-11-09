---
title: 一步一步看懂 Cache：Cache 可視化模擬器
---

> English version: [[engineering/cache-simulator|Seeing Cache Step by Step: A Cache Visualization Simulator]]

寫 CSAPP 的 cache lab、或是計算機結構的 cache 作業時，最花時間的往往不是觀念，而是手算：把一串十六進位位址拆成 tag、set、offset，畫出每個 set 裡的 cache line，一邊追 LRU、一邊判斷這次 miss 到底是 cold、conflict 還是 capacity。算錯一步，後面全部跟著錯。

所以我做了一個工具：[Cache 可視化模擬器](https://moneychien19.github.io/cache-simulator/)（[GitHub](https://github.com/moneychien19/cache-simulator)）。輸入 cache 的設定和一串記憶體存取，它會一步一步播放每一次存取發生了什麼事。

這篇文章分成兩部分。前半部先把 cache 的運作機制講一遍，後半部再介紹這個工具，並用它把前半部的例子實際跑一次。

## Cache 是怎麼運作的

### 為什麼需要 cache

CPU 很快，主記憶體（DRAM）相對很慢。暫存器的存取幾乎不花時間，L1 cache 大約幾個 cycle，但一次 DRAM 存取可能要上百個 cycle。如果每一次 load 都直接去主記憶體拿資料，CPU 大部分時間都會在等待。

Cache 是一塊小而快的記憶體，放在 CPU 和主記憶體之間，保存「最近可能會用到」的資料。它之所以有效，是因為程式的存取模式通常有 **locality**：

- **Temporal locality（時間局部性）**：剛用過的資料，很可能馬上又會用到。例如迴圈裡的計數器、累加變數。
- **Spatial locality（空間局部性）**：用到某個位址，很可能接著會用到它附近的位址。例如依序走訪一個陣列。

Cache 針對這兩種特性設計：它保留最近用過的資料（對應 temporal locality），而且每次從主記憶體搬資料時，不是只搬一個 byte，而是一次搬一整塊相鄰的資料（對應 spatial locality）。這一整塊就叫做 **block**。

### Cache 的結構：S、E、B

CSAPP 用三個參數描述一個 cache：

- **S = $2^s$**：cache 有幾個 set
- **E**：每個 set 有幾條 line（也叫 associativity，幾路關聯）
- **B = $2^b$**：每條 line 存的 block 有幾個 byte

每條 line 除了 block 的資料之外，還有一個 **valid bit**（這條 line 是否有存東西）和一個 **tag**（用來辨認存的是哪一個 block）。整個 cache 能存的資料量是：

```
C = S × E × B
```

依照 E 的不同，cache 可以分成三種組織方式：

| 類型 | 設定 | 說明 |
|---|---|---|
| **Direct-mapped** | E = 1 | 每個 set 只有一條 line，每個 block 只有一個位置可以放 |
| **E-way set-associative** | 1 < E < C/B | 每個 block 只能放進某一個 set，但在 set 裡可以放進任一條 line |
| **Fully-associative** | S = 1 | 只有一個 set，任何 block 都可以放進任何一條 line |

Direct-mapped 最簡單，硬體最便宜，但最容易發生「兩個 block 搶同一個位置」的情況。Fully-associative 最有彈性，但每次查找都要比對所有 line 的 tag，硬體成本高，實際上只用在很小的 cache。

### 一個位址怎麼找到它的位置

給定一個 m-bit 的記憶體位址，cache 會把它切成三段：

```
| tag (t bits) | set index (s bits) | block offset (b bits) |
```

- **block offset**：最低的 b 個 bit，代表資料在 block 裡的第幾個 byte
- **set index**：接下來的 s 個 bit，決定這個 block 要去哪一個 set
- **tag**：剩下的 t = m − s − b 個 bit，用來在 set 裡辨認是哪一個 block

舉個例子。假設 cache 設定為 s = 2、E = 1、b = 4，也就是 4 個 set、direct-mapped、每個 block 16 bytes，總共 64 bytes。要存取的位址是 `0x1321`：

```
0x1321 = 0001 0011 0010 0001

         0001 0011 00 | 10 | 0001
              tag     | set| offset
```

- offset = `0001` = 1
- set = `10` = 2
- tag = `0001001100` = `0x4C`

所以這次存取要去 set 2，看看裡面有沒有 tag 為 `0x4C` 的 line，有的話再取 block 裡第 1 個 byte。

### Hit、miss 和替換

拆好位址之後，查找的流程是：

1. 用 **set index** 找到對應的 set
2. 在這個 set 的所有 line 中，找 valid bit 為 1、且 tag 相同的 line
3. 找到就是 **hit**，直接用 offset 取資料；找不到就是 **miss**

Miss 的時候，cache 要去下一層記憶體把整個 block 搬上來，放進這個 set。如果 set 裡還有空的 line 就直接放；如果滿了，就要選一條 line 踢掉（**eviction**）。最常見的選法是 **LRU（Least Recently Used）**：踢掉最久沒被用到的那條。

記憶體存取有三種操作：

- **L（Load）**：讀取
- **S（Store）**：寫入
- **M（Modify）**：先讀再寫，例如 `x++`，等於一次 L 加一次 S

### Hit 和 miss 的策略

讀取比較單純：hit 就直接從 cache 拿，miss 就把 block 搬上來。寫入則多了一個問題：cache 裡的資料被改了之後，下一層記憶體裡的那一份就過期了，兩邊要怎麼保持一致？依照寫入時是 hit 還是 miss，各有兩種常見的策略：

- Write Hit 時的策略
  - write-through：立即把資料寫回 memory
  - write-back：只更新 cache 中的 block 並設 dirty bit = 1；等到該 line 被 evict 時才把整個 block 寫回 memory，並將 dirty bit 清為 0
- Write Miss 時的策略：
  - write-allocate：先把對應 block 從 memory 載入 cache，再更新 cache
  - no-write-allocate：直接寫到 memory，不載入 cache

實務上通常是 write-back 搭配 write-allocate、write-through 搭配 no-write-allocate。前者減少寫回 memory 的次數，並預期剛寫入的 block 很快會再被用到；後者實作簡單，但每次寫入都要動到 memory。CSAPP cache lab 和這篇的工具都採用 write-back + write-allocate，所以除了 tag 和 LRU，還要追蹤每條 line 的 dirty bit。

### Miss 的三種類型（3C）

Miss 可以依照原因分成三類，合稱 3C：

- **Cold miss（compulsory miss）**：這個 block 從來沒被存取過，第一次用一定會 miss，無論 cache 多大都避免不了。
- **Capacity miss**：程式同時需要的資料量超過 cache 的容量，就算 cache 是 fully-associative 也放不下。
- **Conflict miss**：cache 其實還有空間，但這個 block 只能放在特定的 set，而那個 set 被其他 block 佔滿了，結果它被踢掉。

Cold miss 很好判斷，看這個 block 有沒有出現過就好。困難的是 conflict 和 capacity：同樣是「之前出現過、後來被踢掉」，要怎麼知道是 set 不夠用，還是整個 cache 不夠大？

標準的判斷方法是拿一個**總容量相同的 fully-associative LRU cache** 當作參考：

- 如果參考 cache 也 miss，代表就算位置完全自由也放不下，是 **capacity miss**
- 如果參考 cache 會 hit，代表容量其實夠，只是被 set 的對應方式擠掉，是 **conflict miss**

### 程式寫法會影響命中率

Cache 的行為不是只有硬體設計者需要關心。同樣的運算，換一種寫法，命中率可能天差地遠。

最經典的例子是二維陣列的走訪順序。C 的二維陣列是 **row-major**：`a[i][j]` 和 `a[i][j+1]` 在記憶體裡相鄰，`a[i][j]` 和 `a[i+1][j]` 則相隔一整個 row。

```c
// 依 row 走訪：順著記憶體排列
for (int i = 0; i < N; i++)
  for (int j = 0; j < N; j++)
    sum += a[i][j];

// 依 column 走訪：每次跳一整個 row
for (int j = 0; j < N; j++)
  for (int i = 0; i < N; i++)
    sum += a[i][j];
```

依 row 走訪時，一次 miss 搬上來的 block 裡，接下來幾個元素都會被用到，spatial locality 很好。依 column 走訪時，每次都跳到不同的 block，如果 cache 不夠大或 set 的對應不好，block 可能還沒用到第二個元素就被踢掉了。

但「可能」到底會發生什麼？是 conflict 還是 capacity？換一個 cache 設定會變好嗎？這些問題光靠想像很難回答，下面用工具實際跑一次。

## Cache 可視化模擬器

### 這個工具解決什麼問題

在手算過程中會有幾個痛點：

1. 把位址拆成 tag / set / offset
2. 畫 cache line、追蹤 LRU 和 dirty bit、判斷 3C（還要同時模擬一個參考 cache 用於判斷是否為 capacity miss）

這個工具把這些事都自動做完，並且讓你像放投影片一樣**一步一步前進和後退**，看每一次存取前後 cache 的狀態變化。它不只告訴你最後答案，而是讓你看到每一步的理由，適合拿來對答案，也適合拿來建立直覺。

工具直接開在瀏覽器就能用：<https://moneychien19.github.io/cache-simulator/>

<!-- TODO: 工具整體畫面截圖 -->

### 使用方式

**1. 設定 cache**

輸入 `s`、`E`、`b` 三個參數，或直接從 preset 選擇：

- **Cache 1 — direct-mapped**：s = 2、E = 1、b = 4
- **Cache 2 — fully associative**：s = 0、E = 4、b = 4

這兩個 preset 的總容量都是 64 bytes（4 條 line × 16 bytes），差別只在組織方式，適合拿來比較。

**2. 輸入記憶體存取**

有兩種輸入方式。

第一種是**手打 trace**，格式和 CSAPP cache lab 的 trace 檔類似：

```
L 0x1321
S 0x1756
M 0x1644,4   # 可選的 size，# 之後是註解
```

- 操作支援 `L`、`S`、`M`（`M` 會被展開成一次 L 和一次 S）
- 位址可以加 `0x`，也可以不加
- `,size` 可以省略
- `#` 之後的內容是註解

第二種是**直接貼 C code**。工具會直譯一段 C 的子集，依照陣列的索引自動產生記憶體存取序列。支援的語法包含：

- `int`、`long`、`size_t`、`double`、`float`、`char` 的純量和一維、二維陣列宣告
- 巢狀 `for`、`if` / `else`
- `=`、`+=`、`i++`
- 算術 `+ - * / %`、比較運算、邏輯 `&& || !`

純量被當成存在暫存器裡，不會產生記憶體存取；只有陣列元素的讀寫會產生 L 或 S。陣列依照宣告順序，從位址 0 開始連續擺放，元素大小依型別決定（例如 `int` 是 4 bytes、`double` 是 8 bytes）。

**3. 逐步播放**

執行之後，可以用「上一步 / 下一步 / 重置 / 最後」按鈕，或鍵盤的 ← → 鍵，一次前進或後退一個存取。下方的結果表列出每一次存取的結果，點任一列就能跳到那一步。

**4. 畫面上每一塊在看什麼**

- **位址拆解**：把目前這次存取的位址轉成二進位，並用三種顏色標出 tag、set、offset
- **Cache grid**：畫出每個 set 的每條 line，標示 MRU / LRU、dirty bit，並高亮這一步被 hit、填入或踢掉的 line
- **參考 cache 面板**：顯示同容量的 fully-associative 參考 cache 目前存了哪些 block，作為判斷 conflict 或 capacity 的依據
- **累計統計**：到目前這一步為止的 hit 數，以及各類 miss 的數量

<!-- TODO: 位址拆解與 cache grid 的截圖 -->

### 示範一：同一串 trace，兩種 cache

先用工具的預設 trace 跑一次。設定選 Cache 1（direct-mapped），結果如下：

| # | 存取 | tag | set | 結果 |
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

第 5 步很典型：`0x1A0C` 和第 2 步的 `0x1A04` 在同一個 block，但第 4 步的 `0x1644` 也對應到 set 0，在 direct-mapped 下把它踢掉了。此時整個 cache 只用了 3 個 block，參考 cache 裡它還在，所以這是 **conflict miss**。第 6 步是同樣的情況，只是方向相反。

第 8 步則不同。`0x132E` 和第 1 步的 `0x1321` 在同一個 block，但到這一步為止已經用過 5 個不同的 block，超過 4 條 line 的容量，參考 cache 依 LRU 也已經把它踢掉，所以是 **capacity miss**。

把設定換成 Cache 2（fully-associative，總容量相同），同一串 trace 的結果變成 3 次 hit、5 次 cold miss、1 次 capacity miss。原本的 2 次 conflict miss 都變成了 hit，capacity miss 則還在。這正好對應 3C 的定義：conflict miss 是 set 的對應方式造成的，換成 fully-associative 就會消失；capacity miss 是容量不夠，換組織方式也救不了。

### 示範二：迴圈順序

回到第一部分的迴圈例子。把下面這段貼進 C code 模式：

```c
int a[8][8];
int sum = 0;

for (int i = 0; i < 8; i++) {
  for (int j = 0; j < 8; j++) {
    sum += a[i][j];
  }
}
```

`a` 是 8 × 8 個 `int`，共 256 bytes，每個 row 32 bytes。先把 cache 設成 s = 3、E = 1、b = 4：8 個 set、direct-mapped、每個 block 16 bytes，總共 128 bytes，只放得下半個陣列。

依 row 走訪時，每個 block 放 4 個 `int`，所以每 4 次存取只有第 1 次 cold miss，後面 3 次都 hit。64 次存取裡有 **16 次 cold miss、48 次 hit**，命中率 75%。

把兩層迴圈對調，改成依 column 走訪，結果變成 **16 次 cold miss、48 次 conflict miss、0 次 hit**。

逐步播放會看到原因：走訪同一個 column 時，`a[i][j]` 的位址每次增加 32 bytes，也就是跳過 2 個 block。8 個 row 只會對應到 set 0、2、4、6 這四個 set，每個 set 有兩個 row 在搶，彼此不停地互踢。等到走訪下一個 column，原本搬上來的 block 早就被踢掉了。

但參考 cache 面板會告訴你另一件事：一個 column 只用到 8 個 block，fully-associative 的 8 條 line 剛好放得下。所以這些 miss 都是 **conflict miss**：容量其實夠，是 set 的對應方式出了問題。

再把 cache 縮小成 s = 2、E = 1、b = 4（4 個 set，總共 64 bytes），依 column 走訪的結果變成 **16 次 cold miss、48 次 capacity miss**。這次連參考 cache 都只有 4 條 line，放不下一個 column 需要的 8 個 block，所以 miss 的類型從 conflict 變成了 capacity。依 row 走訪則仍然是 75% 的命中率。

同樣的程式、同樣的走訪順序，miss 的數量一樣，但原因不同，要改善的方向也不同：conflict miss 可以靠提高 associativity 或調整資料擺放來解決，capacity miss 就只能換更大的 cache，或是重新安排運算順序，讓每一段時間內用到的資料量變小。後者正是 **blocking** 這類最佳化的想法。

工具的預設 C code 是一個 4 × 4 矩陣轉置 `B[j][i] = A[i][j]`，同時有依 row 讀和依 column 寫，也很適合拿來試試看不同設定的差異。

<!-- TODO: 示範二 column-major 的逐步播放截圖或 GIF -->

## 總結

Cache 的觀念本身不複雜：拆位址、找 set、比 tag、用 LRU 替換、依照參考 cache 分類 miss。困難的是手算時這些步驟要重複很多次，又要同時追蹤很多狀態。這個工具把這些機械性的工作交給程式，讓注意力可以放回真正重要的問題上：為什麼這一步會 miss？換一種寫法或設定會怎樣？

目前工具只支援 LRU、單層 cache 和 write-back，之後可能延伸的方向包括其他替換策略、多層 cache，以及不同的 write policy。如果你正在寫 cache lab，或是想對 cache 建立更具體的直覺，歡迎[試試看](https://moneychien19.github.io/cache-simulator/)。
