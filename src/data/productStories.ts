// src/data/productStories.ts
/**
 * Product Editorial Story Engine (工艺叙事参数化生成引擎)
 * 
 * Mathematical & Structural Parameter Matrix:
 * Replaces 680 lines of duplicate text copies with an orthogonal tensor decomposition model:
 * Structure Basis (Narrative, Structural Pillars, Metrology Matrix, Care) ⊗ Language Tokens (en/de/fr/es).
 */

export interface StoryContext {
  title?: string;
  sku?: string;
  category?: string;
  image?: string;
  secondaryImage?: string;
  composition?: string;
  gauge?: string;
}

interface LanguageTokens {
  heroHeading: (catName: string) => string;
  heroIntro: (fiber: string, gauge: string) => string;
  quote: string;
  pillarsTitle: string;
  pillarHandlinked: string;
  pillarHandlinkedDesc: string;
  pillarGrip: string;
  pillarGripDesc: string;
  pillarCushion: string;
  pillarCushionDesc: string;
  tableHeader: [string, string, string];
  tableRows: [string, string, string][];
  captionMain: string;
  captionSecondary: string;
  careTitle: string;
  careText: string;
}

const STORY_DICTIONARY: Record<string, LanguageTokens> = {
  de: {
    heroHeading: (cat) => `Architektonische Webkunst & ${cat}`,
    heroIntro: (fiber, gauge) => `Entwickelt aus feinstem **${fiber}** und gefertigt auf italienischen Lonati-Präzisionszylindern (${gauge}). Die dreidimensionale Faserarchitektur garantiert thermodynamische Mikrozirkulation und nahtlose Ergonomie.`,
    quote: `„Wahrer Luxus beruht auf unsichtbarer Präzision: kein Scheuern, kein Rutschen und eine mikrofeine Haptik über den gesamten Tag.“`,
    pillarsTitle: `Kernsäulen der handwerklichen Fertigung`,
    pillarHandlinked: `100% Handgekettelte Zehennaht`,
    pillarHandlinkedDesc: `Traditionell geschlossen für 0.0 mm Nahtwulst – verhindert Druckstellen im Schuh.`,
    pillarGrip: `Biomimetische Silikon-Matrix`,
    pillarGripDesc: `Hautfreundliche Haftzonen an der Ferse verhindern jegliches Schlupfen ohne Einschnüren.`,
    pillarCushion: `Verstärkte Belastungszonen`,
    pillarCushionDesc: `Dichte Maschenstruktur an Sohle und Ferse für maximale Reibungsbeständigkeit.`,
    tableHeader: ['Technischer Parameter', 'Werkstoleranz / Standard', 'Prüfverfahren'],
    tableRows: [
      ['Spitzennaht-Höhentoleranz', 'Δh ≤ 0.1 mm (Nahezu vollkommen eben)', 'Taktile Präzisions-Endkontrolle'],
      ['Reibechtheit (Martindale)', '≥ 25.000 Zyklen ohne Pilling', 'ISO 12947-2 Normprüfung'],
      ['Farb- und Waschbeständigkeit', 'Stufe 4–5 (Höchste Farbtreue)', 'DIN EN ISO 105-C06'],
      ['Öko-Zertifizierung', 'OEKO-TEX® Standard 100 Klasse I', 'Unabhängiges Prüfinstitut'],
    ],
    captionMain: `Präzise Lonati-Garnführung für reibungslose Übergänge und seidigen Glanz.`,
    captionSecondary: `Mikro-Struktur der Fersengrip-Matrix und verstärkten Sohlenkonstruktion.`,
    careTitle: `Pflege- und Langlebigkeitsprotokoll`,
    careText: `Auf links bei maximal 30°C im Feinwaschgang waschen. Keinen Weichspüler verwenden, um die Elastomer-Spannkraft zu erhalten. Liegend an der Luft trocknen.`,
  },
  fr: {
    heroHeading: (cat) => `Artisanat Textile & ${cat}`,
    heroIntro: (fiber, gauge) => `Confectionné à partir de **${fiber}** sur métiers circulaires italiens Lonati (${gauge}). Cette structure procure une régulation thermique naturelle et une coupe anatomique sans démarcation.`,
    quote: `« Le véritable luxe réside dans la perfection invisible : zéro frottement, tenue infaillible et toucher seconde peau durable. »`,
    pillarsTitle: `Piliers de l'ingénierie textile`,
    pillarHandlinked: `Rémaillage intégral à la main`,
    pillarHandlinkedDesc: `Fermeture artisanale de la pointe (épaisseur 0.0 mm) supprimant tout frottement douloureux.`,
    pillarGrip: `Matrice silicone biomimétique`,
    pillarGripDesc: `Zone d'adhérence douce au talon maintenant la chaussette en place sans comprimer la cheville.`,
    pillarCushion: `Renfort anatomique haute densité`,
    pillarCushionDesc: `Tissage renforcé aux zones d'impact pour une résistance accrue à l'abrasion.`,
    tableHeader: ['Paramètre technique', 'Tolérance d’usine / Spécification', 'Méthode d’évaluation'],
    tableRows: [
      ['Tolérance de couture en pointe', 'Δh ≤ 0.1 mm (Zéro surépaisseur)', 'Contrôle tactile de précision'],
      ['Résistance à l’abrasion (Martindale)', '≥ 25 000 cycles sans boulochage', 'Norme ISO 12947-2'],
      ['Solidité des teintures au lavage', 'Indice 4–5 (Haute rétention)', 'NF EN ISO 105-C06'],
      ['Certificat environnemental', 'OEKO-TEX® Standard 100 Classe I', 'Laboratoire certifié indépendant'],
    ],
    captionMain: `Tissage de haute précision Lonati offrant un tombé fluide et des finitions soignées.`,
    captionSecondary: `Architecture micro-adhérente au talon et coussin de confort intégré.`,
    careTitle: `Protocole d'entretien et durabilité`,
    careText: `Lavage délicat à 30°C sur l'envers. Éviter les adoucissants pour préserver l'élasticité active des fibres. Séchage à plat recommandé.`,
  },
  es: {
    heroHeading: (cat) => `Ingeniería Textil & ${cat}`,
    heroIntro: (fiber, gauge) => `Elaborado con selecto **${fiber}** y tejido en cilindros de precisión Lonati (${gauge}). Esta estructura tridimensional aporta regulación térmica natural y ajuste anatómico sin presión.`,
    quote: `«El verdadero lujo reside en la precisión invisible: sin roces, sin deslizamiento y con una suavidad duradera todo el día.»`,
    pillarsTitle: `Pilares de fabricación artesanal`,
    pillarHandlinked: `Puntera remallada a mano`,
    pillarHandlinkedDesc: `Costura completamente plana (0.0 mm) para erradicar cualquier punto de fricción.`,
    pillarGrip: `Matriz antideslizante biomimética`,
    pillarGripDesc: `Inserciones de silicona hipoalergénica en el talón que fijan la prenda al calzado de forma segura.`,
    pillarCushion: `Zonas de impacto reforzadas`,
    pillarCushionDesc: `Tejido de doble densidad en la planta y talón para una excelente resistencia al desgaste.`,
    tableHeader: ['Parámetro técnico', 'Tolerancia de fábrica / Estándar', 'Método de ensayo'],
    tableRows: [
      ['Espesor de costura en puntera', 'Δh ≤ 0.1 mm (Completamente plana)', 'Control táctil de precisión'],
      ['Resistencia a la abrasión (Martindale)', '≥ 25.000 ciclos sin pilling', 'Ensayo ISO 12947-2'],
      ['Solidez del color al lavado', 'Grado 4–5 (Máxima estabilidad)', 'UNE EN ISO 105-C06'],
      ['Certificación ecológica', 'OEKO-TEX® Standard 100 Clase I', 'Instituto independiente'],
    ],
    captionMain: `Tejido de precisión Lonati con acabados sin costuras y tacto suave.`,
    captionSecondary: `Detalle del agarre anatómico de talón y plantilla de densidad graduada.`,
    careTitle: `Protocolo de conservación y longevidad`,
    careText: `Lavar del revés a 30°C en ciclo delicado. Prescindir de suavizantes para preservar la elasticidad y secar en plano sin centrifugado agresivo.`,
  },
  en: {
    heroHeading: (cat) => `Architectural Weave & ${cat}`,
    heroIntro: (fiber, gauge) => `Crafted from **${fiber}** using Italian Lonati high-gauge knitting cylinders (${gauge}). The 3D fiber architecture delivers thermal micro-regulation and an invisible, zero-friction fit.`,
    quote: `“True luxury lies in invisible precision: zero chafing, zero heel slippage, and an ultra-fine tactile finish all day.”`,
    pillarsTitle: `Artisan Manufacturing Pillars`,
    pillarHandlinked: `100% Hand-Linked Seamless Toe`,
    pillarHandlinkedDesc: `Virtually zero ridge height (0.0 mm) to eliminate irritation and blister friction.`,
    pillarGrip: `Biomimetic Silicone Grip Matrix`,
    pillarGripDesc: `Hypoallergenic grip ribbons engineered to anchor the heel without constricting circulation.`,
    pillarCushion: `Reinforced High-Stress Zones`,
    pillarCushionDesc: `High-density loop cushioning engineered into heel and toe beds for exceptional durability.`,
    tableHeader: ['Technical Parameter', 'Factory Tolerance / Standard', 'Verification Protocol'],
    tableRows: [
      ['Toe Seam Ridge Height', 'Δh ≤ 0.1 mm (Seamless plane)', 'Precision tactile micrometer test'],
      ['Abrasion Resistance (Martindale)', '≥ 25,000 cycles zero pill', 'ISO 12947-2 Standard testing'],
      ['Color Fastness to Laundering', 'Grade 4–5 (Maximum retention)', 'ISO 105-C06 Standard protocol'],
      ['Safety & Ecological Standard', 'OEKO-TEX® Standard 100 Class I', 'Independent accredited lab'],
    ],
    captionMain: `Lonati calibrated yarn feed delivering seamless transitions and refined luster.`,
    captionSecondary: `Micro-architecture of the anatomical heel-grip and reinforced impact sole.`,
    careTitle: `Care & Longevity Protocol`,
    careText: `Machine wash inside out on delicate cycle at max 30°C (86°F). Avoid fabric softeners to maintain elastomeric recovery. Air dry flat.`,
  },
};

/**
 * Resolves a tailored, elegant editorial narrative in Markdown using parameterized templates.
 */
export function getProductStory(ctx: StoryContext, lang: string = 'en'): string {
  const selectedLang = ['de', 'fr', 'es', 'en'].includes(lang) ? lang : 'en';
  const t = STORY_DICTIONARY[selectedLang];

  const catName = ctx.category || ctx.title || 'Curated Silhouette';
  const fiber = ctx.composition || 'Premium Long-Staple Fibers';
  const gauge = ctx.gauge || '200-Needle Lonati Cylinder';
  const mainImg = ctx.image || '/images/hero-light.webp';
  const secondaryImg = ctx.secondaryImage || mainImg;

  // Render markdown based on orthogonal parameterized matrix
  return `### ${t.heroHeading(catName)}

${t.heroIntro(fiber, gauge)}

![${catName} Specification Focus](${mainImg})
*${t.captionMain}*

> *${t.quote}*

#### ${t.pillarsTitle}
- **${t.pillarHandlinked}**: ${t.pillarHandlinkedDesc}
- **${t.pillarGrip}**: ${t.pillarGripDesc}
- **${t.pillarCushion}**: ${t.pillarCushionDesc}

| ${t.tableHeader[0]} | ${t.tableHeader[1]} | ${t.tableHeader[2]} |
| :--- | :--- | :--- |
| **Material Composition** | ${fiber} | Spectrometric Fiber Analysis |
| **Gauge / Cylinder** | ${gauge} | Calibrated Sensor Verification |
${t.tableRows.map((r) => `| **${r[0]}** | ${r[1]} | ${r[2]} |`).join('\n')}

![${catName} Ergonomic Architecture](${secondaryImg})
*${t.captionSecondary}*

#### ${t.careTitle}
${t.careText}
`;
}
