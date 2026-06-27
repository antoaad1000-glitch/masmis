export function buildQuestionPrompt(params: {
  sourcePrompt: string;
  sourceCategory: string;
  sourcePage?: number;
}) {
  return `Tu es un expert de l'examen civique de naturalisation française.

À partir de cette question officielle ou thème officiel, génère UNE question QCM en français.

Contraintes strictes :
- La question doit rester conforme au niveau de l'examen civique officiel.
- Il doit y avoir exactement 4 réponses.
- Une seule réponse doit être correcte.
- Les mauvaises réponses doivent être plausibles mais clairement fausses.
- Ne crée pas de contenu politique partisan.
- Ne renvoie rien sauf un JSON valide.
- Le champ correct_answer doit être un entier de 1 à 4.

Catégories autorisées :
- French Republic values
- Institutions and politics
- Rights and duties
- History
- Geography
- Culture
- Daily life in France
- European Union

Difficultés autorisées : easy, medium, hard

Source officielle :
Catégorie PDF : ${params.sourceCategory}
Page PDF : ${params.sourcePage ?? "inconnue"}
Question/thème officiel : ${params.sourcePrompt}

Format exact :
{
  "question": "...",
  "answers": ["...", "...", "...", "..."],
  "correct_answer": 1,
  "category": "...",
  "difficulty": "easy",
  "explanation": "...",
  "source": "Official naturalisation guide"
}`;
}
