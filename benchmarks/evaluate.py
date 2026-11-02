"""Dependency-free, reproducible paired-transcript evaluation. Never fabricates results."""
import argparse
import json
import re
from pathlib import Path
from statistics import mean, median


def distance(a, b):
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (x != y)))
        previous = current
    return previous[-1]


def normalize(text):
    return re.sub(r"[^\w\s']", '', text.casefold()).split()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pairs', type=Path, help='JSON array: reference, hypothesis, language; optional timing_errors_seconds')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    records = json.loads(args.pairs.read_text())
    if not records:
        parser.error('Supply at least one evaluated recording.')
    results = []
    for row in records:
        ref, hyp = normalize(row['reference']), normalize(row['hypothesis'])
        if not ref:
            raise ValueError('Empty reference: score silence/hallucinations separately')
        chars_ref, chars_hyp = ' '.join(ref), ' '.join(hyp)
        item = {'id': row['id'], 'language': row['language'], 'wer': distance(ref, hyp) / len(ref),
                'cer': distance(chars_ref, chars_hyp) / len(chars_ref)}
        timing = sorted(abs(x) for x in row.get('timing_errors_seconds', []))
        if timing:
            item.update(timestamp_median_seconds=median(timing), timestamp_p95_seconds=timing[min(len(timing)-1, int(.95*len(timing)))])
        results.append(item)
    report = {'normalization': "casefold; remove punctuation except apostrophes; whitespace words", 'clips': results,
              'macro_wer': mean(x['wer'] for x in results), 'macro_cer': mean(x['cer'] for x in results),
              'warning': 'Aggregate by language and noise condition before comparing systems. This does not score summary quality.'}
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + '\n')
    print(text)


if __name__ == '__main__':
    main()
