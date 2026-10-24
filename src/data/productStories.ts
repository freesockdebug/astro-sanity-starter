// src/data/productStories.ts
/**
 * Product Editorial Story Engine (图文并茂多语言工艺叙事生成引擎)
 * 
 * Provides rich, illustrated, category-tailored Markdown content across all four supported languages:
 * English (en), German (de), French (fr), Spanish (es).
 * 
 * Includes:
 * - High-definition visual imagery with captions
 * - Artisan craftsmanship narrative and philosophical quote blockquotes
 * - Technical specification & testing protocol tables
 * - Key structural engineering pillars
 * - Luxury textile care and longevity guidelines
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

export function getProductStory(ctx: StoryContext, lang: string = 'en'): string {
  const category = (ctx.category || '').toLowerCase();
  const title = ctx.title || 'Curated Silhouette';
  const sku = ctx.sku || 'GWENVENNI';
  const mainImg = ctx.image || '/images/hero-light.webp';
  const secondImg = ctx.secondaryImage || ctx.image || '/images/spec-light.webp';
  const comp = ctx.composition || 'Premium Long-Staple Fibers';
  const gauge = ctx.gauge || '200-Needle Lonati Micro Weave';

  // 1. Silk Series (桑蚕丝无痕系列)
  if (category.includes('silk') || title.toLowerCase().includes('silk')) {
    switch (lang) {
      case 'de':
        return `### Architektonische Seidenwebe & Unsichtbare Zweite-Haut-Eleganz

Gefertigt aus feinstem **6A-Klasse Maulbeerseiden-Garn**, verkörpert dieses Modell die Symbiose aus traditioneller Naturfaser und modernster italienischer Rundstricktechnologie. Die Faserstruktur reguliert auf natürliche Weise Feuchtigkeit und Temperatur, während die ultraflache Silhouette unsichtbar im Loafer oder Ballerina verschwindet.

![Detailaufnahme Seidengewebe und Nahtverarbeitung](${mainImg})
*Präzise 200-Nadel-Lonati-Strickung für reibungslose Übergänge und seidigen Glanz.*

> *"Wahrer Luxus beruht auf unsichtbarer Perfektion: kein Scheuern, kein Rutschen und eine mikrofeine Haptik, die den ganzen Tag über anhält."*

#### Kernsäulen der handwerklichen Fertigung
- **100% Handgekettelte Spitzennaht**: Von erfahrenen Kunsthandwerkern geschlossen, wodurch die störende Maschinenwulst komplett eliminiert wird.
- **Biomimetische Silikon-Fersengrip-Matrix**: Dreidimensionale, hautfreundliche Silikonstreifen an der Ferse verhindern jegliches Herabrutschen im Schuh.
- **Verstärkte Baumwollsohle**: Ein eingestrickter Baumwoll-Terry-Kern an der Lauffläche sorgt für optimale Schweißabsorption und Trittsicherheit.

| Technischer Parameter | Werkstoleranz / Standard | Prüfverfahren |
| :--- | :--- | :--- |
| **Materialzusammensetzung** | ${comp} | Spektrometrische Faseranalyse |
| **Zylinder-Feinheit** | ${gauge} | Kalibrierte Lonati-Sensorik |
| **Spitzenwulst-Höhe** | 0.0 mm (Vollkommen eben) | Taktile Präzisions-Endkontrolle |
| **Zertifizierung** | OEKO-TEX® Standard 100 Klasse I | Unabhängiges Prüfinstitut |

![Mikro-Struktur des Fersengrips und Sohlenkonstruktion](${secondImg})
*Gezielte Zonenverstärkung an Ferse und Ballen für maximale Langlebigkeit.*

#### Pflege- & Langlebigkeitshinweise
1. **Schonwäsche**: Bei maximal 30°C im Wäschesäckchen mit Seiden- oder Wollwaschmittel waschen.
2. **Trocknung**: Liegend im Schatten an der Luft trocknen – niemals im Wäschetrockner oder auf heißen Heizkörpern.`;

      case 'fr':
        return `### Soie de Mûrier Aérienne & Confort Invisible Seconde Peau

Tissé à partir de **soie de mûrier de grade 6A supérieur**, ce modèle allie la noblesse des fibres naturelles à la précision de nos métiers circulaires italiens 200 aiguilles. Naturellement thermorégulatrice et antibactérienne, la soie préserve la fraîcheur du pied tout en restant invisible dans les mocassins et escarpins.

![Détail de la maille de soie et finition sans couture](${mainImg})
*Précision de tricotage Lonati 200N garantissant un toucher satiné et une résistance accrue.*

> *"Le luxe véritable réside dans le confort imperceptible : zéro frottement, maintien irréprochable et douceur enveloppante toute la journée."*

#### Piliers de Notre Savoir-Faire
- **Pointe Remaillée Main à Plat**: Réalisée rangée par rangée par nos artisans pour supprimer toute surépaisseur gênante au bout des orteils.
- **Adhérence Talon Silicone Biomimétique**: Bandes de silicone médical hypoallergénique intégrées pour empêcher tout glissement lors de la marche.
- **Semelle Plantaire Respirante**: Renfort en coton peigné sous le pied pour une absorption optimale de l’humidité.

| Spécification Technique | Norme d'Atelier | Méthode de Contrôle |
| :--- | :--- | :--- |
| **Composition Textile** | ${comp} | Analyse Spectroscopique de Fibre |
| **Jauge de Tricotage** | ${gauge} | Calibrage Électronique Lonati |
| **Relief Couture Pointe** | 0.0 mm (Zéro Épaisseur) | Inspection Tactile Artisanale |
| **Sécurité Écologique** | OEKO-TEX® Standard 100 Classe I | Certification Laboratoire Agréé |

![Vue détaillée de la semelle et de l'adhérence talon](${secondImg})
*Conception anatomique épousant les courbes du pied sans compression veineuse.*

#### Guide d'Entretien & Préservation
1. **Lavage Délicat**: À l'eau tiède (30°C max) dans un filet protecteur avec une lessive spéciale soie.
2. **Séchage Naturel**: À plat à l'abri de la lumière directe du soleil – proscrire tout passage au sèche-linge.`;

      case 'es':
        return `### Seda de Morera Natural y Ajuste Invisible de Segunda Piel

Elaborado con **hilos de seda de morera de grado 6A superior**, este modelo fusiona el lujo táctil de la seda pura con la precisión de los cilindros circulares italianos de 200 agujas. Su textura ultra fina y fresca se adapta a la silueta del pie permaneciendo completamente invisible bajo mocasines y zapatos de vestir.

![Detalle de tejido en seda y acabado artesanal](${mainImg})
*Tejido fino Lonati 200N con brillo natural satinado y alta resistencia al uso.*

> *"La auténtica elegancia no busca llamar la atención, sino brindar una sensación de confort imperceptible y duradera."*

#### Pilares de Calidad y Fabricación
- **Puntera Remallada a Mano**: Unión hilo a hilo por maestros artesanos que elimina cualquier reborde de costura en la puntera.
- **Silicona Antideslizante Biomimética**: Bandas de gel hipoalergénico en el talón que garantizan una sujeción firme sin desplazarse.
- **Planta de Apoyo en Algodón Peinado**: Base inferior reforzada en algodón transpirable para una correcta absorción del sudor.

| Parámetro Técnico | Estándar de Fábrica | Protocolo de Inspección |
| :--- | :--- | :--- |
| **Composición Textil** | ${comp} | Análisis de Composición en Laboratorio |
| **Galga de Telar** | ${gauge} | Calibración Digital Lonati |
| **Grosor de Costura Puntera** | 0.0 mm (Completamente Plana) | Verificación Manual Unitaria |
| **Inocuidad Dérmica** | OEKO-TEX® Standard 100 Clase I | Certificación Ecológica Homologada |

![Estructura de talón y plantilla reforzada](${secondImg})
*Refuerzos anatómicos ubicados estratégicamente para proteger zonas de mayor fricción.*

#### Consejos de Cuidado y Lavado
1. **Lavado Suave**: Lavar a máquina a un máximo de 30°C dentro de bolsa protectora con detergente neutro para seda.
2. **Secado al Aire**: Secar en posición horizontal a la sombra. No utilizar secadora.`;

      default:
        return `### Architectural Silk Knit & Second-Skin Invisible Calibration

Engineered from pristine **Grade-6A Mulberry Silk filaments**, this silhouette reconciles ultra-fine natural luxury with the micron precision of Italian 200-needle circular knitting cylinders. Naturally thermoregulating and hypoallergenic, it provides a cooling second-skin barrier that disappears entirely beneath tailored loafers and dress shoes.

![Mulberry Silk Weave Macro and Seamless Finish](${mainImg})
*200-needle high-tension Lonati knitting creating smooth filament continuity and gentle natural luster.*

> *"True bespoke luxury is an imperceptible sensation: zero ridge friction, locked-in heel retention, and day-long thermal equilibrium."*

#### Core Engineering Pillars
- **Micro-Gauge Hand-Linked Toe**: Finished stitch-by-stitch by artisans, completely eliminating the abrasive ridge found on conventional machine-sewn socks.
- **Biomimetic Silicone Heel Lock**: Multi-tiered waves of hypoallergenic silicone engineered to hug the calcaneus bone and prevent heel slippage.
- **Cushioned Moisture-Wicking Footbed**: A dense combed-cotton base knitted into the underside for rapid sweat absorption and non-slip shoe traction.

| Engineering Specification | Factory Standard | Inspection Protocol |
| :--- | :--- | :--- |
| **Yarn Architecture** | ${comp} | ISO Optical Fiber Spectrometry |
| **Knitting Cylinder** | ${gauge} | Calibrated Italian Lonati Sensors |
| **Toe Ridge Elevation** | 0.0 mm (True Seamless) | 100% Tactile Artisan Inspection |
| **Eco Certification** | OEKO-TEX® Standard 100 Class I | Independent Laboratory Verified |

![Heel Grip Geometry and Tension Architecture](${secondImg})
*Strategically mapped elasticity zones providing anatomical support without vascular constriction.*

#### Care & Longevity Protocol
1. **Gentle Cleaning**: Machine wash inside a mesh wash-bag at $\\le 30^\\circ\\text{C}$ (86°F) using silk or delicate wool detergent.
2. **Air Dry**: Reshape while damp and lay flat away from direct radiant heat. Never tumble dry.`;
    }
  }

  // 2. Cashmere & Merino Wool Series (羊绒与超细美利奴系列)
  if (category.includes('cashmere') || category.includes('wool') || title.toLowerCase().includes('cashmere') || title.toLowerCase().includes('merino')) {
    switch (lang) {
      case 'de':
        return `### Luxuriöse Alpengarne & Feine 200-Nadel-Rippenkonstruktion

Gewonnen aus erlesenem **18.5µ Inner-Mongolia-Kaschmir** und superfeiner Merinowolle, bietet diese Silhouette unvergleichliche Wärmeisolation bei minimalem Gewicht. Die feine 200-Nadel-Rippung sorgt für eine natürliche Dehnbarkeit und behält auch nach ganztägigem Tragen ihre Spannkraft.

![Kaschmir-Rippenstruktur und weicher Griff](${mainImg})
*Ausgewogene Garnzwirnung für exzellente Pilling-Resistenz und langlebige Weichheit.*

> *"Kaschmir von höchster Reinheit berührt die Haut wie ein Hauch von Nichts – wärmend, atmungsaktiv und vollendet formstabil."*

#### Wichtige Qualitätsmerkmale
- **Doppelzylinder-Rippenbund**: Sanfter, druckfreier Halt an der Wade ohne Einschnüren des Blutkreislaufs.
- **Verstärkte Fersen- und Zehenkappe**: Dezente Beimischung elastischer Mikrofilamente für erhöhte Scheuerfestigkeit im Stiefel.
- **Handgekettelte Spitzenverbindung**: Nahtloser Tragekomfort für sensible Füße.

| Qualitätsmerkmal | Sollwert / Spezifikation | Nachweismethode |
| :--- | :--- | :--- |
| **Faserfeinheit** | 18.5 Mikrometer | Mikroskopische Faseranalyse |
| **Strickart** | ${gauge} | Lonati Computer-Steuerung |
| **Pilling-Beständigkeit** | Note 4.0+ | Martindale Scheuerprüfung |

![Stiefelpassform und Schaftabschluss](${secondImg})
*Ergonomischer Wadenverlauf für optimalen Sitz in Business-Schuhen und Lederstiefeln.*`;

      case 'fr':
        return `### Cachemire d'Alpage & Côte Fine Architecturale 200N

Sélectionné parmi les fibres les plus nobles de **cachemire 18,5µ et mérinos extra-fin**, ce modèle enveloppe le pied d’une chaleur douce sans aucune lourdeur. Sa côte 200 aiguilles assure un tombé impeccable le long de la jambe sans glisser ni comprimer.

![Texture côtelée et toucher cachemire](${mainImg})
*Tricot italien haute densité garantissant souplesse et tenue parfaite au fil des ports.*

> *"La pureté du cachemire réside dans son équilibre subtil : une caresse thermique aérienne associée à une durabilité éprouvée."*

#### Caractéristiques de Fabrication
- **Bord-Côte Double Cylindre**: Maintien souple et sans démarcation le long du mollet.
- **Renforts Ciblés Talon & Pointe**: Fibres techniques de soutien pour prévenir l'usure prématurée dans les bottines.
- **Pointe Remaillée Main**: Élimine toute gêne pour un confort souverain.

| Critère de Qualité | Valeur d'Atelier | Méthode d'Essai |
| :--- | :--- | :--- |
| **Micronage Fibre** | 18,5 microns | Analyse Optique Agréée |
| **Cylindre de Maille** | ${gauge} | Métiers Circulaires Lonati |
| **Résistance au Boulochage**| Grade 4.0+ | Test d'Abrasion Martindale |

![Tricotage du talon et finitions artisanales](${secondImg})
*Finitions soignées conçues pour durer saison après saison.*`;

      case 'es':
        return `### Cachemira de Selección y Canalé Fino de 200 Agujas

Confeccionado con **cachemira de 18,5 micras** y lana merina ultrafina, esta silueta proporciona un abrigo excepcional con una ligereza inigualable. El canalé elástico abraza suavemente la pantorrilla manteniendo la prenda en su sitio durante toda la jornada.

![Detalle de canalé elástico en lana y cachemira](${mainImg})
*Estructura de punto de alta densidad para evitar el pilling y maximizar la suavidad.*

> *"La nobleza de la cachemira auténtica se siente al primer contacto: calidez envolvente, transpirabilidad y caída perfecta."*

#### Aspectos Clave de Confección
- **Puño Elástico sin Presión**: Se adapta a la pierna sin dejar marcas ni oprimir la circulación.
- **Zonas de Fricción Reforzadas**: Refuerzo invisible en puntera y talón para una mayor vida útil con botas de cuero.
- **Puntera Plana Remallada**: Tacto liso que evita rozaduras en los dedos.

| Parámetro de Calidad | Especificación | Método de Comprobación |
| :--- | :--- | :--- |
| **Finura del Hilo** | 18,5 micras | Microscopía Textil Avanzada |
| **Estructura** | ${gauge} | Sistema Electrónico Lonati |
| **Resistencia al Pilling** | Grado 4.0+ | Prueba de Fricción Martindale |

![Refuerzo de puntera y talón anatómico](${secondImg})
*Patrón ergonómico adaptado a zapatos de vestir y botas de invierno.*`;

      default:
        return `### Heritage Cashmere & Fine 200-Needle Ribbed Architecture

Crafted from ethically sourced **18.5µ Inner-Mongolian Cashmere** and superfine Australian Merino Wool, this silhouette establishes a benchmark for thermal luxury and weightless drape. The calibrated 200-needle rib structure flexes naturally with step movement while preserving full vertical memory across weeks of wear.

![Cashmere-Silk Ribbed Texture and Luster](${mainImg})
*Dual-twisted luxury filaments spun to minimize surface fuzz while maximizing tactile loft.*

> *"The essence of pure cashmere is weightless warmth—an understated luxury that breathes, insulates, and flatters effortlessly."*

#### Signature Architectural Attributes
- **Dual-Cylinder Comfort Welt**: Gentle tension distribution across the calf preventing cuff marks or downward slippage.
- **Reinforced Ball & Heel Zones**: Engineered micro-filaments co-knitted at stress areas to withstand leather boot friction.
- **Hand-Linked Toe Construction**: Zero-ridge flat seam across the toe box eliminating bunching and pressure points.

| Quality Standard | Target Specification | Laboratory Test Method |
| :--- | :--- | :--- |
| **Fiber Diameter** | 18.5 Microns (Superfine) | Laser Fiber Diameter Analyzer |
| **Knit Calibration** | ${gauge} | Automated Lonati Tension Sensors |
| **Pilling Resistance** | Grade 4.0+ | Martindale Abrasion 5,000 Cycles |
| **Colorfastness** | Grade 4-5 | ISO 105-X12 Wet & Dry Rubbing |

![Heel Pocket and Ribbed Transition Macro](${secondImg})
*Anatomical heel cup engineered to anchor the sock securely inside dress shoes.*

#### Luxury Wool Care Protocol
1. **Washing**: Hand wash or gentle wool cycle at $\\le 20^\\circ\\text{C}$ with pH-neutral cashmere shampoo.
2. **Drying**: Squeeze gently in a dry towel without wringing; dry flat on a sweater drying rack.`;
    }
  }

  // 3. Combed Cotton & Lace Ruffle Series (双层蕾丝木耳边与精梳棉系列)
  if (category.includes('cotton') || title.toLowerCase().includes('ruffle') || title.toLowerCase().includes('lace') || title.toLowerCase().includes('cotton')) {
    switch (lang) {
      case 'de':
        return `### Gekämmte Langstapel-Baumwolle & Florale Doppelrüschen-Spitze

Diese bezaubernde Silhouette kombiniert **100% gekämmte Baumwolle** mit einer filigranen, doppellagigen Rüschensäume. Sanft zur empfindlichen Kinder- und Damen-Haut, formbeständig beim Toben und Waschen sowie absolut kratzfrei am Knöchel.

![Detailaufnahme der doppelten Rüschenspitze](${mainImg})
*Zweilagige, formstabile Spitzenborte mit elastischer Einfassung für perfekten Halt am Knöchel.*

> *"Verspielte Eleganz trifft auf solide Manufakturqualität: reißfeste Naturfasern, OEKO-TEX Klasse I Sicherheit und feine Details."*

#### Handwerkliche Besonderheiten
- **Doppelte Rüschenkante**: Hochwertige Spitzenborte, die auch nach vielen Wäschen ihre aufrechte, lebendige Form behält.
- **Verstärkte Belastungszonen**: Y-förmige Fersenkonstruktion für stabilen Halt am Fuß ohne Verdrehen im Schuh.
- **Schadstofffrei & Hypoallergen**: Zertifiziert nach OEKO-TEX Standard 100 Klasse I (für Babys und Kleinkinder geeignet).

| Eigenschaft | Werksspezifikation | Prüfverfahren |
| :--- | :--- | :--- |
| **Hauptmaterial** | ${comp} | Faserreinheitsprüfung |
| **Spitzenmaterial** | Formstabiles Mikro-Nylon/Elastan | Dehnungs-Rücksprungtest |
| **Sicherheitsstandard** | OEKO-TEX® Klasse I & CPSIA | Schadstoff-Screening |

![Fersenpassform und feine Maschenstruktur](${secondImg})
*Weiche Maschenware für maximale Atmungsaktivität das ganze Jahr über.*`;

      case 'fr':
        return `### Coton Peigné Douceur & Double Volant de Dentelle Aérienne

Ce modèle allie la douceur respirante d'un **coton peigné longues fibres** à l'élégance raffinée d'un double volant de dentelle plissée. Idéal pour sublimer les tenues de cérémonie comme le quotidien, tout en respectant les peaux les plus délicates.

![Détail du volant de dentelle double épaisseur](${mainImg})
*Dentelle travaillée conservant son gonflant et son allure même après lavages répétés.*

> *"L'équilibre parfait entre romantisme classique et résistance textile certifiée pour un confort absolu."*

#### Atouts Techniques & Confection
- **Double Volant Froncé**: Finition soignée qui ne s'affaisse pas et n'irrite jamais la cheville.
- **Talon Y Ergonomique**: Enveloppe parfaitement l'arrière du pied pour éviter que la chaussette ne glisse dans la chaussure.
- **Teintures Éco-Certifiées**: Conforme aux exigences strictes OEKO-TEX Classe I (sans métaux lourds ni formaldéhyde).

| Spécification | Norme d'Atelier | Validation |
| :--- | :--- | :--- |
| **Fibre Principale** | ${comp} | Contrôle Peignage & Longueur |
| **Finition Dentelle**| Double bord festonné haute tenue | Test de Résistance Traction |
| **Sécurité Contact** | OEKO-TEX® Standard 100 Classe I | Contrôle Hypoallergénique |

![Structure de la semelle et pointe sans couture](${secondImg})
*Une douceur naturelle qui dure lavage après lavage.*`;

      case 'es':
        return `### Algodón Peinado de Fibra Larga y Volante Doble de Encaje

Diseñado para aportar un toque de encanto atemporal, este modelo combina **algodón peinado de primera calidad** con un exquisito volante doble de encaje fruncido. Proporciona una agradable transpirabilidad y se mantiene impecable uso tras uso.

![Detalle del encaje fruncido y borde elástico](${mainImg})
*Encaje elástico de alta memoria que conserva su forma festoneada sin deshilacharse.*

> *"Detalles que marcan la diferencia: encaje delicado sobre algodón suave, libre de sustancias nocivas y agradable al contacto con la piel."*

#### Puntos Destacados de Fabricación
- **Volante Doble Festoneado**: Acabado decorativo de gran consistencia que realza cualquier conjunto con zapatos o merceditas.
- **Talón en Y de Ajuste Profundo**: Diseñado para acomodar el pie de forma natural sin crear arrugas en el empeine.
- **Certificación OEKO-TEX Clase I**: Tintes y fibras totalmente seguros incluso para pieles infantiles sensibles.

| Parámetro | Estándar Gwenvenni | Control |
| :--- | :--- | :--- |
| **Tejido Base** | ${comp} | Análisis de Pureza de Hilo |
| **Remallado** | Sin costuras prominentes | Control Manual Unitario |
| **Normativa de Seguridad** | OEKO-TEX® Clase I y CPSIA | Certificado Oficial de Laboratorio |

![Detalle de tejido y elasticidad en empeine](${secondImg})
*Comodidad y frescura ideales para lucir en cualquier época del año.*`;

      default:
        return `### Long-Staple Combed Cotton & Tiered Double Ruffle Lace

Designed with romantic poise and everyday resilience, this signature silhouette pairs breathable **long-staple combed cotton** with an artisan dual-tiered floral lace ruffle collar. Engineered to maintain its crisp, flared geometry after repeated laundering, it delivers second-skin comfort without ankle friction.

![Double Ruffle Lace Trim Collar Detail](${mainImg})
*Dual-layer structured lace ruffle engineered with high elastic recovery to prevent collar drooping.*

> *"True elegance blends whimsical vintage charm with rigorous textile craftsmanship—hypoallergenic, OEKO-TEX certified, and durable."*

#### Architectural Highlights
- **Tiered Double-Ruffle Collar**: Precision gathered edge that stands upright gracefully without causing pressure marks or ankle binding.
- **Deep Y-Gore Heel Pocket**: 3D knitted heel geometry ensuring slip-free positioning inside formal dress shoes and mary janes.
- **Skin-Safe Ecological Guarantee**: Certified under OEKO-TEX Standard 100 Class I (infant and sensitive skin approved) and CPSIA compliant.

| Specification Parameter | Factory Tolerance Standard | Testing Methodology |
| :--- | :--- | :--- |
| **Body Composition** | ${comp} | Fiber Purity & Staple Length Verification |
| **Collar Architecture** | Tiered Double Ruffle Lace | High-Tension Elastic Return Cycle |
| **Toe Seam Flatness** | 0.0mm (Zero Ridge Flat Seam) | Tactile Hand Inspection |
| **Eco Certification** | OEKO-TEX® Standard 100 Class I | Independent Laboratory Certified |

![Breathable Footbed Knit Structure](${secondImg})
*Fine gauge knit delivering day-long breathability and gentle arch support.*

#### Care & Laundering Recommendations
1. **Laundering**: Machine wash inside a mesh wash-bag at $\\le 30^\\circ\\text{C}$ on gentle cycle.
2. **Maintenance**: Reshape the lace ruffle lightly with your fingers while damp; lay flat to air dry.`;
    }
  }

  // 4. Athletic Terry & Compression Series (运动毛圈与减震加固系列)
  if (category.includes('terry') || category.includes('sport') || category.includes('athletic') || title.toLowerCase().includes('terry') || title.toLowerCase().includes('speed') || title.toLowerCase().includes('running')) {
    switch (lang) {
      case 'de':
        return `### Ergonomische 3D-Frotteepolsterung & Dynamische Fußgewölbeunterstützung

Konzipiert für maximale Dämpfung und intensive Belastung: Die **dreidimensionale Frotteeschlingen-Sohle** dämpft Stoßkräfte bei jedem Schritt ab. Ein integriertes Kompressionsband am Mittelfuß stabilisiert das Fußgewölbe und verhindert das Verrutschen im Trainingsschuh.

![Frotteesohle und Kompressionsband im Mittelfuß](${mainImg})
*Dichte Frotteeschlingen federn Stöße an Ballen und Ferse wirksam ab.*

> *"Leistungssport verlangt kompromisslose Zuverlässigkeit: anatomische Dämpfung, kühles Fußklima und rutschfester Halt."*

#### Technische Leistungsmerkmale
- **Hochverdichtete Frotteeschlingen**: Reduzieren Stoßbelastungen bei Läufen und Sprungübungen spürbar.
- **Rundumlaufende Fußgewölbe-Kompression**: Zentriert die Socke und wirkt Ermüdungserscheinungen des Fußes entgegen.
- **Cordura®-Verstärkung an Ferse & Spitze**: Bis zu dreimal höhere Abriebfestigkeit gegenüber herkömmlichen Sportsocken.

| Kennzahl | Laborwert | Prüfstandard |
| :--- | :--- | :--- |
| **Dämpfungsdicke (Sohle)** | 3.2 mm Plüschschlingen | Dickenmessung unter 5 kPa Druck |
| **Mittelfuß-Kompression** | 15 - 20 mmHg | Dynamische Druckbandprüfung |
| **Feuchtigkeitstransport** | Trocknungszeit < 25 Min. | AATCC 195 Feuchtigkeitsmanagement |

![Achillessehnenschutz und Belüftungszonen](${secondImg})
*Mesh-Zonen auf dem Spann leiten warme Luft zügig nach außen ab.*`;

      case 'fr':
        return `### Bouclette Amortissante 3D & Support de Voûte Plantaire Compressif

Pensé pour les sportifs exigeants et les journées actives, ce modèle intègre une **semelle en bouclette dense tridimensionnelle** qui absorbe les ondes de choc. La bande de compression médio-pied verrouille la chaussette en place sans créer de plis.

![Semelle en bouclette technique et bande de maintien](${mainImg})
*Amorti dynamique sous l'avant-pied et le talon pour soulager les articulations.*

> *"L'ingénierie sportive au service du pied : protection des zones d'impact, ventilation ciblée et maintien infaillible."*

#### Innovations & Confort
- **Zones Amortissantes Ciblées**: Bouclette protectrice au niveau du tendon d'Achille et de la tête des métatarses.
- **Maintien de la Voûte Plantaire**: Élastique calibré prévenant les torsions et le glissement dans les baskets.
- **Tricotage Aéré sur le Coup-de-Pied**: Mailles ouvertes pour évacuer rapidement la chaleur et l'humidité.

| Paramètre Sport | Valeur de Performance | Norme |
| :--- | :--- | :--- |
| **Épaisseur Amorti** | 3,2 mm bouclettes denses | Norme Dynamique d'Impact |
| **Soutien Voûte** | 15 à 20 mmHg | Compression Dégressive Élastique |
| **Évacuation Humidité** | Séchage ultra-rapide | Test AATCC 195 |

![Détail de la protection tendon d'Achille](${secondImg})
*Protection renforcée pour éviter les ampoules et frottements répétitifs.*`;

      case 'es':
        return `### Rizo Anatómico Amortiguador y Soporte Dinámico de Puente

Diseñado para soportar entrenamientos exigentes y movimientos intensos, este calcetín incorpora **suela de rizo técnico tridimensional** que amortigua cada pisada. Su banda de compresión en el arco plantar mantiene la prenda firme dentro de la zapatilla.

![Suela acolchada de rizo y banda elástica de arco](${mainImg})
*Rizo denso de alta resiliencia que protege metatarsos y talón de impactos repetidos.*

> *"Rendimiento y confort sin concesiones: amortiguación estratégica, ventilación activa y resistencia superior al roce."*

#### Puntos Fuertes de Rendimiento
- **Amortiguación de Impactos en Rizo**: Absorbe la energía de choque en saltos y zancadas largas.
- **Banda Elástica de Arco Plantar**: Previene el desplazamiento del calcetín y alivia la fatiga en el pie.
- **Zonas Transpirables en el Empeine**: Panel microperforado para una evacuación continua del calor.

| Rendimiento | Valor de Ensayo | Método |
| :--- | :--- | :--- |
| **Grosor del Acolchado** | 3,2 mm | Medición bajo Carga 5 kPa |
| **Ajuste del Arco** | 15 - 20 mmHg | Tensión Elástica Dinámica |
| **Tiempo de Secado** | < 25 minutos | Protocolo de Gestión de Humedad AATCC |

![Protección de tendón de Aquiles y puntera reforzada](${secondImg})
*Costuras planas reforzadas para evitar la formación de rozaduras o ampollas.*`;

      default:
        return `### 3D Impact Cushioning Terry & Dynamic Plantar Arch Compression

Engineered for rigorous athletic pursuits and long-duration shifts, this silhouette features high-density **3D loop-terry cushioning** strategically zoned under the heel, ball, and Achilles tendon. An anatomical compression wrap around the midfoot anchors the sock firmly inside athletic trainers to eliminate blister-causing friction.

![High-Density Terry Cushioning and Arch Wrap](${mainImg})
*Micro-loop terry architecture delivering impact attenuation without unnecessary bulk.*

> *"High-performance athletics demands uncompromising reliability: precision impact absorption, rapid moisture dispersal, and zero slippage."*

#### Performance Engineering Attributes
- **High-Impact Shock Absorption**: Specialized 3.2mm terry loops that compress progressively under foot strikes to cushion joint impact.
- **360-Degree Arch Compression Wrap**: Ribbed elastane band centering the sock to reduce foot fatigue and eliminate bunching.
- **Engineered Mesh Instep Chimney**: Open-weave ventilation grid on top of the foot allowing metabolic heat and humidity to escape instantly.

| Performance Metric | Laboratory Standard | Inspection Protocol |
| :--- | :--- | :--- |
| **Cushion Loft Thickness** | 3.2 mm (Dense Loops) | ASTM D1777 Thickness Under 5 kPa |
| **Plantar Arch Compression** | 15 - 20 mmHg Band | Dynamic Elasticity Retention Test |
| **Moisture Vapor Dispersal** | Dry-Rate < 25 Minutes | AATCC 195 Dynamic Moisture Management |
| **Abrasion Cycles** | 20,000+ Cycles No Rupture | Martindale Heavy Abrasion Protocol |

![Achilles Guard and Anatomical Toe Box](${secondImg})
*Dedicated Achilles tendon cushion guard protecting against stiff shoe collar bite.*

#### Performance Gear Laundering
1. **Washing**: Machine wash warm (40°C / 104°F) with standard detergent; avoid fabric softeners to keep moisture-wicking channels open.
2. **Drying**: Tumble dry on low heat or hang dry for extended elasticity life.`;
    }
  }

  // 5. Sheer & Tights Series (15D 极细透肤丝袜系列)
  if (category.includes('sheer') || category.includes('tights') || title.toLowerCase().includes('sheer') || title.toLowerCase().includes('tights')) {
    switch (lang) {
      case 'de':
        return `### 15D Ultrafeines Mikrofilament & Zweite-Haut-Mattfinish

Entwickelt für eine absolut makellose, unsichtbare Beinoptik: Die **15-Denier-Präzisionswebe** erzeugt einen zarten Puder-Effekt, der Hauttöne harmonisiert und kleine Unebenheiten sanft kaschiert. Eine hochelastische Doppelgarnumwindung sorgt für verbesserte Reiß- und Laufmaschenfestigkeit.

![15D Feinstrumpfgewebe und matter Schimmer](${mainImg})
*Gleichmäßige Maschendichte für ebenmäßige Beine mit natürlichem, reflexfreiem Finish.*

> *"Subtile Perfektion für anspruchsvolle Garderoben: ein Hauch von mattem Schleier, der Beine optisch glättet und verlängert."*

#### Besonderheiten der Konstruktion
- **Laufmaschenhemmende Hochzwirn-Technologie**: Verhindert das unkontrollierte Weiterlaufen kleiner Fadenzieher.
- **Komfort-Bund ohne Einschneiden**: Breiter, elastischer Bund sitzt sanft auf der Taille ohne einzurollen.
- **Atmungsaktiver Baumwollzwickel**: Für ein hygienisches, frisches Tragegefühl den ganzen Tag über.

| Eigenschaft | Werksspezifikation | Nachweis |
| :--- | :--- | :--- |
| **Garnfeinheit** | 15 Denier | Mikrometer-Feinheitsanalyse |
| **Oberflächenoptik** | Mattes Puder-Finish | Glanzmessung unter Kunstlicht |
| **Taillenbund** | 4.5 cm Soft-Stretch | Druckfreier Dehnungsversuch |

![Taillenbund und Zwickelverarbeitung](${secondImg})
*Hochwertige Verarbeitung für vollkommenen Tragekomfort unter eng anliegenden Kleidern.*`;

      case 'fr':
        return `### Voile 15D Aérien & Effet Poudré Seconde Peau

Conçu pour sublimer la jambe en toute transparence, ce **collant 15 deniers haute précision** offre un voile poudré délicat qui floute subtilement les imperfections de la peau. Le fil guipé doublement apporte une résistance accrue contre les mailles filées.

![Transparence et finition mate du voile 15D](${mainImg})
*Tissage régulier et soyeux procurant une sensation de douceur aérienne.*

> *"La perfection invisible de la haute bonneterie : un galbe naturel, un mat éclatant et une tenue irréprochable."*

#### Détails de Haute Confection
- **Technologie Anti-Filage**: Le maillage resserré stoppe la propagation des accrocs du quotidien.
- **Ceinture Confort Sans Pression**: Large bande élastique douce qui reste bien en place sans marquer la taille.
- **Gousset en Coton Respirant**: Assure fraîcheur, hygiène et aisance dans tous vos mouvements.

| Critère | Norme d'Atelier | Contrôle |
| :--- | :--- | :--- |
| **Titre du Fil** | 15 Deniers | Calibrage Électronique |
| **Effet Visuel** | Mat Poudré Naturel | Contrôle Réflexion Lumineuse |
| **Ceinture** | Largeur 4,5 cm extensible | Test Élongation sans Déformation |

![Finition de la ceinture et de la pointe](${secondImg})
*Invisible même sous les robes les plus fluides et les jupes ajustées.*`;

      case 'es':
        return `### Velo Transparente 15D y Acabado Mate Perfeccionador

Diseñado para un efecto de pierna impecable y natural, este **panti de 15 deniers** crea un sutil filtro perfeccionador que unifica el tono de la piel. El hilado de doble recubrimiento confiere una elasticidad elástica y mayor resistencia frente a las carreras accidentales.

![Detalle de transparencia mate y elasticidad 15D](${mainImg})
*Malla regular ultrafina para una apariencia de pierna uniforme, esbelta y luminosa.*

> *"El encanto de la discreción: transparencia cristalina con acabado mate que estiliza la figura con suavidad."*

#### Rasgos Distintivos de Fabricación
- **Tejido de Mayor Resistencia**: Estructura de hilo continuo que dificulta la formación de carreras.
- **Cintura Anatómica Cómoda**: Banda ancha y suave que se adapta a la silueta sin apretar ni enrollarse.
- **Rombo Higiénico de Algodón**: Aporta frescura, transpiración y confort durante toda la jornada.

| Especificación | Valor Gwenvenni | Ensayo |
| :--- | :--- | :--- |
| **Densidad de Hilo** | 15 Deniers | Medición de Grosor de Filamento |
| **Acabado Óptico** | Mate Sedoso Anti-Brillo | Fotometría de Superficie |
| **Banda de Cintura** | 4,5 cm de Elástico Suave | Comprobación de Confort |

![Cinturilla elástica y puntera reforzada](${secondImg})
*Invisibilidad total bajo vestidos de noche o faldas de corte recto.*`;

      default:
        return `### 15-Denier Micro-Filament & Translucent Second-Skin Calibration

Engineered to deliver an airbrushed, porcelain finish across the leg, this **15-denier ultra-sheer knit** features double-covered micro-spandex filaments for supple flexibility and superior run-resistance. The micro-mesh scatters ambient light to subtly blur minor blemishes while remaining invisible under sheer dresses and tailored skirts.

![15D Sheer Translucency and Matte Glow Detail](${mainImg})
*Uniform micro-gauge stitch distribution creating consistent tone with zero camera glare.*

> *"Sophistication lies in effortless restraint: a weightless matte veil that refines skin tone while remaining completely undetectable."*

#### Signature Engineering Attributes
- **Run-Resistant Double-Wrapped Filaments**: Interlocked elastane cores that arrest minor snags from propagating into catastrophic ladder runs.
- **Zero-Pinch Soft Contour Waistband**: 4.5cm wide ergonomic band designed to sit flat against the waist without rolling down or creating abdominal ridges.
- **Breathable Cotton Hygiene Gusset**: Pure natural cotton insert offering moisture management and hygiene throughout day and evening wear.

| Engineering Specification | Factory Standard | Testing Methodology |
| :--- | :--- | :--- |
| **Filament Denier** | 15D Multi-Filament | Precision Electronic Denier Measurement |
| **Surface Optical Profile**| Powder-Matte Natural | Incident Light Spectrometry |
| **Waistband Tension** | Ergonomic Zero-Pinch (< 8 mmHg) | Multi-Point Abdominal Pressure Sensor |
| **Eco Certification** | OEKO-TEX® Standard 100 Class I | Independent Laboratory Verified |

![Ergonomic Waistband and Invisible Toe Detail](${secondImg})
*Flatlock seam finishing ensuring complete invisibility under skin-tight silks.*

#### Sheer Hosiery Longevity Guidelines
1. **Donning**: Gather the leg gradually from toe to thigh, ensuring fingernails and jewelry do not catch the sheer filaments.
2. **Washing**: Hand wash gently in lukewarm water; never machine wash with zippered or Velcro garments.`;
    }
  }

  // 6. Generic Luxury B2B Fallback (通用豪华精梳棉与多材质工艺叙事)
  switch (lang) {
    case 'de':
      return `### Architektonische Strickkunst & Zweite-Haut-Passform

Jedes Modell wird auf echten italienischen **200-Nadel-Lonati-Rundstrickzylindern** mit Mikrometer-Präzision gefertigt. Durch die Verbindung von hochgedrehten Naturfasern mit hochelastischem Elastan garantiert dieser Schnitt anatomischen Halt ohne Einschnüren.

![Fertigungspräzision und Garnstruktur](${mainImg})
*Gleichmäßige Maschenbindung auf computergesteuerten Lonati-Maschinen.*

> *"Wahrer Luxus liegt in der unsichtbaren Perfektion: makellose Fadenspannung, scheuerfreie Handkettelung und langlebige Faserqualität."*

#### Kernsäulen unserer Handwerkskunst
- **Handgekettelte Spitzennaht**: Von erfahrenen Kunsthandwerkern geschlossen – für ein vollkommen nahtloses Tragegefühl im Schuh.
- **Doppelzylinder-Rücksprungkraft**: Bewahrt den perfekten Sitz auch nach über 50 Waschzyklen ohne Ausleiern.
- **OEKO-TEX® Standard 100 Klasse I**: Umweltfreundliche Färbung, sanft zu empfindlicher Haut.

| Fertigungsparameter | Werkstoleranz | Prüfverfahren |
| :--- | :--- | :--- |
| **Materialzusammensetzung** | ${comp} | Faseranalyse Labor |
| **Spitzennahtflachheit** | 0.0 mm (Nahtlos) | Taktile Präzisionsprüfung von Hand |
| **Waschfarbechtheit** | Stufe 4.5+ | ISO 105-C06 Laborprüfprotokoll |

![Fersendetail und Tragekomfort](${secondImg})
*Präzise gearbeitete Fersentasche für stabilen Sitz.*`;

    case 'fr':
      return `### Maille Architecturale & Effet Seconde Peau

Chaque paire est conçue sur d’authentiques métiers circulaires italiens **Lonati 200 aiguilles**, calibrés au micromètre près. L’harmonie entre fils haute torsion et fibres souples assure un maintien anatomique délicat sans compression.

![Précision de tricotage et finesse des fils](${mainImg})
*Tissage régulier et soigné pour une tenue durable.*

> *"Le véritable luxe ne réside pas dans l’artifice, mais dans la perfection invisible de la tension du fil et la douceur d’un remaillage sans couture."*

#### Piliers de Savoir-Faire
- **Pointe Remaillée Main**: Finition artisanale supprimant tout relief gênant au contact du soulier.
- **Élasticité Double Cylindre**: Maintien durable conservant sa mémoire de forme après plus de 50 lavages.
- **Certification OEKO-TEX® Classe I**: Teintures écologiques certifiées, idéales pour peaux sensibles.

| Paramètre Technique | Tolérance Usine | Méthode de Contrôle |
| :--- | :--- | :--- |
| **Composition** | ${comp} | Contrôle Laboratoire Textile |
| **Finition Pointe** | 0.0 mm (Zéro Relief) | Inspection Tactile Artisanale |
| **Solidité au Lavage** | Indice 4.5+ | Protocole de Laboratoire ISO 105-C06 |

![Détail de finition talon et pointe](${secondImg})
*Confort et résistance au quotidien.*`;

    case 'es':
      return `### Estructura Arquitectónica y Tacto Segunda Piel

Cada par se elabora en auténticas tejedoras circulares italianas **Lonati de 200 agujas**, calibradas con precisión micrométrica. La sincronización de hilos de alta torsión con elastano de alta recuperación brinda soporte anatómico sin oprimir.

![Detalle de tejido y elasticidad del hilo](${mainImg})
*Acabado textil homogéneo que mantiene su estructura lavado tras lavado.*

> *"El verdadero lujo reside en la perfección imperceptible: tensión de hilo exacta, costura plana sin fricción y durabilidad excepcional."*

#### Pilares de Artesanía
- **Puntera Remallada a Mano**: Remate artesanal que elimina el borde abultado para un confort total con el calzado.
- **Memoria Elástica de Doble Cilindro**: Mantiene el ajuste impecable tras más de 50 lavados sin deslizarse.
- **Certificación OEKO-TEX® Classe I**: Fórmulas de tinte hipoalergénicas y respetuosas con la piel sensible.

| Parámetro de Fabricación | Tolerancia de Fábrica | Método de Ensayo |
| :--- | :--- | :--- |
| **Composición** | ${comp} | Verificación Analítica |
| **Planeidad de Puntera** | 0.0 mm (Sin Reborde) | Inspección Manual de Precisión |
| **Solidez al Lavado** | Grado 4.5+ | Protocolo de Laboratorio ISO 105-C06 |

![Detalle del talón y acabado sin costuras](${secondImg})
*Sujeción anatómica y comodidad duradera.*`;

    default:
      return `### Architectural Knit & Second-Skin Calibration

Every pair is engineered on authentic Italian **200-needle Lonati circular knitting cylinders**, calibrated down to micron tolerances. By synchronizing high-twist filaments with organic elastane fibers, this silhouette delivers gentle anatomical support without constricting venous circulation.

![High-Precision Lonati Circular Knitting Weave](${mainImg})
*High-gauge needle layout ensuring smooth surface finish and long-wearing fiber resilience.*

> *"Luxury is not superficial ornamentation—it is the imperceptible perfection of yarn tension, zero toe-seam friction, and long-staple durability."*

#### Core Craftsmanship Pillars
- **Micro-Gauge Hand-Linked Toe**: Finished by master artisans eliminating the bulky machine ridge for frictionless shoe contact.
- **Double-Cylinder Elastic Recovery**: Retains calibrated grip and elasticity over 50+ wash cycles without slipping or pilling.
- **OEKO-TEX® Standard 100 Class I**: Hypoallergenic, eco-friendly dye formulas gentle on sensitive skin.

| Specification Parameter | Factory Tolerance Standard | Testing Methodology |
| :--- | :--- | :--- |
| **Fiber Architecture** | ${comp} | Opto-Electronic Fiber Analysis |
| **Toe Seam Flatness** | 0.0mm (Zero Ridge) | Precision Tactile Hand Inspection |
| **Colorfastness (Wash)** | Grade 4.5+ | ISO 105-C06 Laboratory Protocol |

![Heel Geometry and Ergonomic Arch Transition](${secondImg})
*Engineered heel pocket designed to stay locked in position inside formal and casual footwear.*`;
  }
}
