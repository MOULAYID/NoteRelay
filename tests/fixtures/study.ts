import type { StudyChapter, StudyDocument } from "../../src/documents/model";
export function sampleChapter(index = 1): StudyChapter {
  return {
    id: `chapter-${index}`,
    title:
      index === 1
        ? "Get and Transform Data from Excel"
        : index === 2
          ? "Nettoyer les données avec Power Query"
          : "Cours en salle : interprétation et révision",
    addedAt: 1793630000000,
    source: {
      sessionId: `lecture-${index}`,
      lectureTitle: `Lecture ${index}`,
      kind: index === 3 ? "microphone" : "tab",
      recordedAt: 1793630000000,
      ...(index !== 3
        ? { url: `https://www.youtube.com/watch?v=lecture${index}` }
        : {}),
    },
    notes: {
      id: `notes-${index}`,
      sessionId: `lecture-${index}`,
      transcriptId: `transcript-${index}`,
      createdAt: 1793631000000,
      format: "detailed",
      language: index === 1 ? "English" : "French",
      model: "fixture-model",
      promptVersion: "notes-v1",
      title: `Notes ${index}`,
      sections: [
        {
          heading:
            index === 1
              ? "From raw files to useful tables"
              : "Qualité, précision et traçabilité",
          content:
            index === 1
              ? "Power Query turns raw files into repeatable transformations. **Keep the original source** and document each step.\n\n- Inspect data types.\n- Remove duplicated rows deliberately.\n- Preserve meaningful missing values.\n\n| Step | Purpose |\n| --- | --- |\n| Import | Read the source file |\n| Transform | Apply documented rules |\n\n```python\nrows = [1, 2, 3]\nfor row in rows:\n    print(row)\n```"
              : "Les données doivent être vérifiées avant toute décision. Électricité, fréquence, cœur, œuvre, naïve : les caractères français restent lisibles.\n\n**Définition :** une valeur manquante n’est pas nécessairement une erreur.\n\n1. Décrire les observations.\n2. Vérifier les hypothèses.\n3. Expliquer les résultats.\n\nLa moyenne est notée μ et la variation Δ. Pour cette illustration, x ≤ 10.",
          sourceIds: [`segment-${index}`],
          kind: "lecture",
        },
      ],
      warnings: ["Audio-only notes may omit material shown on slides."],
    },
    references: [
      {
        segmentId: `segment-${index}`,
        start: 12.5,
        end: 30,
        ...(index !== 3
          ? {
              videoTime: 72.5,
              videoUrl: `https://www.youtube.com/watch?v=lecture${index}&t=72s`,
            }
          : {}),
      },
    ],
  };
}
export function sampleDocument(long = false): StudyDocument {
  const chapters = [sampleChapter(1), sampleChapter(2), sampleChapter(3)];
  if (long) {
    chapters[1].title =
      "Nettoyer, vérifier et interpréter les données avec Power Query : méthodes reproductibles pour comparer plusieurs sources, conserver les transformations et expliquer les résultats à une équipe";
    chapters[1].notes.sections.push({
      heading: "Exemple détaillé et discussion des limites",
      content:
        Array.from(
          { length: 28 },
          (_, i) =>
            `Exemple ${i + 1}. La transformation est documentée pour qu’une autre personne puisse reproduire l’analyse. Vérifier les types, les valeurs manquantes et les doublons avant de calculer les indicateurs. Une conclusion doit rester liée aux observations et signaler les incertitudes.`,
        ).join("\n\n") +
        "\n\nIdentifiant technique long : " +
        "reproducible_identifier_".repeat(14) +
        "\n\nhttps://example.org/" +
        "long-resource-name-".repeat(12),
      kind: "lecture",
      sourceIds: ["segment-2"],
    });
  }
  return {
    id: "study-fixture",
    title: "Excel et qualité des données — Notes de cours",
    createdAt: 1793630000000,
    updatedAt: 1793631000000,
    revision: 1,
    chapters,
  };
}
