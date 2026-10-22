---
title: "Same Sample, Opposite Leads: The Party Weighting Debate in Taipei's 2026 Mayoral Polls"
---

> 中文版：[[zh/musings/same-sample-opposite-leads|民調該不該做政黨加權：以 2026 年台北市長民調為例]]

On October 20, the Hsin-Min Association (信民協會) released its second poll of the Taipei mayoral race: Puma Shen of the Democratic Progressive Party (DPP) at 50.3%, and incumbent mayor Chiang Wan-an of the Kuomintang (KMT) at 33.3%.

> [!note]
> - Blue: KMT
> - Green: DPP
> - White: Taiwan People's Party (TPP), once seen as leaning green, more recently seen as leaning blue
> - Blue-white: KMT and TPP counted together

The poll drew attention not only because Taipei, a traditionally blue city, appeared to have flipped, but also because of what Tai Li-an, who designed and analyzed the survey, said about "party weighting" near the end of the press conference. He stressed that the poll was weighted only on demographics (sex, age, education, and district), and that the principle was to [never alter the political leanings respondents express](https://news.ltn.com.tw/news/politics/breakingnews/5612404). He compared a poll to an electrocardiogram: it is there to measure, not to draw a line with a ruler for the public to see.

Tai then pulled up the party composition of TVBS's two Taipei mayoral polls this year. In both, blue-white versus green was 58:42, exactly the vote split in 2022 between KMT candidate Chiang Wan-an plus TPP candidate Huang Shan-shan on one side and DPP candidate Chen Shih-chung on the other. He implied that TVBS might have weighted to that ratio, and showed that applying 58:42 to his own sample would flip the result to [Chiang leading by 7 points](https://newtalk.tw/news/view/2026-10-20/1066564), not far from the TVBS numbers. TVBS has not said whether it weights by party.

Same respondents, a different weighting scheme, and a 17-point Shen lead becomes a 7-point Chiang lead. My first reaction was to side with Tai: party identification and vote choice are practically the same thing, so isn't weighting by party just filling in the answer ahead of time? But the more I thought about it, the less simple it seemed, so I decided to work through it all at once: how party weighting works, where the target ratio comes from, and whether it should be done at all.

## What party weighting does

Party weighting adjusts the blue-green ratio in a sample to some predetermined target. It uses the same mechanism as ordinary demographic weighting; the only difference is that the target is political leaning.  
A poll sample almost never matches the population exactly. Say women make up 52% of the population but 60% of the sample. Each female respondent's weight goes down and each male respondent's goes up until the weighted share is back at 52%. That is exactly what the Hsin-Min poll does, weighting on four variables (sex, age, education, and district), all of which have official figures published by the city government.  
Party weighting just adds one more target to this mechanism: the sample's blue-green ratio. In the Hsin-Min sample, pan-blue is 26.6% and TPP 4.0%, against 42.2% pan-green, which works out to roughly 42:58 blue-white versus green, the TVBS ratio flipped. To adjust it to 58:42, each blue-white respondent's weight would be multiplied by about 1.4, and each green respondent's by 0.72.

The adjustment matters so much because party identification and vote choice are almost tied together. In this sample, 90.6% of pan-blue respondents back Chiang and 94.5% of pan-green respondents back Shen. Move the blue-green ratio, and support moves almost one for one.

### If you weight, where do the numbers come from

There is no official census of party identification, so the target is always borrowed from somewhere, and every source carries its own assumptions.

The most common source is a past election. 58:42 is the blue-white versus green vote split from the 2022 Taipei mayoral race. The problem is that every election happens in its own context: 2018 had the Han Kuo-yu wave, 2022 had the vaccine controversy and a thesis plagiarism scandal, and Tai argues both [favored the blue camp considerably](https://news.ltn.com.tw/news/politics/breakingnews/5612404). Using the last election as the target assumes the electorate hasn't changed since then.

What about using the most recent election instead? Both sides say to look at 2024, but they pick different measures:

- Huang Ching-lung, chair of the Hsin-Min Association, cites the 2024 **district legislative** vote in Taipei, where the DPP out-polled the KMT by about 10,000 votes, and argues Taipei is no longer 58:42.
- TVBS cites the 2024 **party-list** vote and argues Taipei is [still more blue than green](https://storm.mg/article/11174096).
- In the 2024 **presidential** vote, Hou You-yi and Lai Ching-te each took about 38% in Taipei, and Ko Wen-je about 24%. Counting Ko's votes as "white," blue-white versus green comes to roughly 62:38, even bluer than 58:42.

Same year, same city, and a different measure points in the opposite direction. Choosing a target is itself a judgment about the electorate, not merely a technical step.

## To weight or not to weight

The answer depends on where the blue-green imbalance in the sample comes from. The trouble is that "green voters are more willing to pick up the phone" and "public opinion has genuinely shifted green" produce exactly the same sample. In other words, you can't tell which one it is from a single sample, and each side is essentially betting on one of the two explanations.

### For: weight by party

The core argument for weighting is differential nonresponse: people with different political leanings are not equally willing to be surveyed.

For demographic weighting to remove bias, one condition has to hold: within each demographic cell, the people who respond and the people who refuse must have the same political leanings. Picture college-educated women aged 40 to 49 in Da'an District, split evenly between blue and green. But the green camp has momentum right now, so 30% of green voters agree to answer when called, versus only 15% of blue voters. The completed interviews come out 33 blue to 67 green. Demographic weighting only checks that the cell has the right number of people; the blue-green ratio inside it is still skewed.  
Tai himself said at the press conference that [pan-green respondents were highly willing to state a preference, while blue-white supporters showed a spiral of silence](https://newtalk.tw/news/view/2026-10-20/1066564). That describes exactly this mechanism.

People who oppose weighting often share an intuition: party identification and vote choice are endogenous, and someone who sees themselves as green will mostly vote green. If you reach 40 blue and 60 green respondents, support will come out around 4:6. As long as sex, age, and district all match the population, why call that sample biased?

The problem is that sampling bias is measured against the population. If Taipei is actually 55:45, a 40:60 sample will systematically overstate the green camp. The strong link between party and vote doesn't make this problem go away; it makes it worse, because however far the blue-green ratio is off, support is off by about as much.

### Against: don't weight by party

The core argument against weighting is that party identification is not a fixed trait like age or sex.  
It is partly shaped by the race itself: people who were neutral get swept up by momentum and start to see themselves as green. If the population really has moved from 58:42 to 45:55, forcing the sample back to 58:42 means correcting today's answer with yesterday's, erasing a real shift in opinion. That is exactly Tai's objection.

There are signs in this poll that support this reading. The party composition it shows moved about 8 points in a month: in September green led blue-white by about 3 points, and in October by about 11. If that is a genuine "Puma wave," any party weighting that targets a past election will flatten it. Of course, the same change could just be a shift in response rates, which brings us back to the identification problem.

## Compromises and their costs

Since both weighting and not weighting carry risk, there are roughly three compromises in practice, and each one trades one assumption for another.

**Weighting on recalled vote**: instead of asking "which party do you support now," ask "who did you vote for last time," then match that to the actual results. The upside is a real benchmark that isn't swayed by the mood of the current race. The downside is that respondents misremember, and often claim to have voted for the winner. And the 2022 electorate isn't the same as the 2026 one: there are first-time voters, and people who won't turn out this time.

**Correcting at the projection stage**: this is actually what Tai does. His support numbers use only demographic weighting, but the vote-share projection in his report ranges from [Chiang ahead by 0.7% to Shen ahead by 6.0%](https://news.ltn.com.tw/news/politics/breakingnews/5612014), far narrower than the 17-point gap in support. Working from the report's own figures, turnout adjustment can't explain the narrowing: among respondents who say they will definitely vote, Shen actually leads by 21.5 points. What's left are parameters like "past voting results," or an assumption that undecided voters lean mostly blue. Huang Ching-lung also said the projection accounts for the blue camp's spiral of silence. In other words, Tai doesn't skip party correction altogether; he moves it to a different step, and he hasn't published those parameters either.

**Publishing the parameters**: this isn't a third method so much as a precondition for the other two. Tai said that anyone who applies subjective adjustments to the data should disclose them, so the public doesn't mistake them for sampling error or house effects. That standard is right, but it should apply to TVBS's weighting and to his own projection alike.

## Conclusion

Back to the original question. Asking whether to weight by party is really asking whether party identification is an independent variable or a dependent one. If it is a stable identity, a blue-green imbalance in the sample is bias and should be corrected; if it moves with the race, correcting it erases public opinion.

In reality it is both, and the data alone can't say in what proportion. Each pollster has made an assumption that can't be verified: one assumes blue and green voters within a demographic cell are equally willing to respond; the other assumes the electorate looks roughly like it did in 2022. Once the votes are counted on November 28, we'll know which assumption was further off.

## Sources

All sources are in Chinese.

- [Hsin-Min Association: 2026 Taipei Mayoral Election Poll](https://dc579968-5ed9-4902-8454-9871fa44324e.filesusr.com/ugd/3ea6ac_257951a3d235492f8595f6dcd7b5cdd3.pdf), fielded 2026/10/14–16
- [Liberty Times: Shen up 17% becomes down 7%? Tai Li-an tests the "mystery parameter"](https://news.ltn.com.tw/news/politics/breakingnews/5612404)
- [Liberty Times: Shen over 50% and safe? Tai Li-an projects vote share](https://news.ltn.com.tw/news/politics/breakingnews/5612014)
- [Newtalk: Taipei mayoral poll shows a "regime change" scenario](https://newtalk.tw/news/view/2026-10-20/1066564)
- [Storm Media: TVBS responds that 2024 party vote is still more blue](https://storm.mg/article/11174096)
- [The News Lens: Analysis of the 2024 presidential vote in Taipei](https://www.thenewslens.com/article/197533)
