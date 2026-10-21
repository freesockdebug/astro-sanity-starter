import { SanityImageService } from '@utils/image';
import { DEFAULT_FALLBACK_IMAGE } from './defaults';
import { getLocalizedValue, DEFAULT_LOCALE, type SupportedLocale } from '@i18n';

export const IMAGE = `{
  "_id": asset->_id,
  "src": asset->url,
  "alt": alt
}`;

export const SECTIONS = `{
  ...,
  _type in ["heroSection", "hosieryHeroSection"] => {
    ...,
    "heroImage": heroImage.asset->url
  },
  _type in ["featureMatrixSection", "hosierySpecSection"] => {
    ...,
    "macroImage": macroImage.asset->url
  },
  _type in ["productShowcaseSection", "hosieryCollectionSection"] => {
    ...,
    products[]->{
      title,
      shortTitle,
      "slug": slug.current,
      sku,
      tagline,
      moq,
      leadTime,
      "mainImage": mainImage.asset->url,
      colors,
      wholesalePrice,
      "specifications": specifications[0..1]
    }
  },
  _type == "customSection" => {
    ...,
    blocks[]{
      ...,
      _type == "mediaBlock" => {
        ...,
        "image": image.asset->url,
        "secondaryImage": secondaryImage.asset->url
      },
      _type == "bentoCardBlock" => {
        ...,
        cards[]{
          ...,
          "image": image.asset->url
        }
      },
      _type == "quoteBlock" => {
        ...,
        "avatar": avatar.asset->url
      }
    }
  }
}`;

/**
 * High-precision multilingual textile & B2B manufacturing dictionaries
 * Translates CMS homepage sections seamlessly when browsing non-English locales
 */
export const SECTION_TRANSLATIONS: Record<string, Record<string, any>> = {
  de: {
    heroSection: {
      superTitle: 'B2B-Herstellung & Private-Label-Atelier',
      headline: 'Raffinierte Eleganz. 200-Nadel-Mikrostrick.',
      subline: 'Gestrickt auf italienischen Lonati-Maschinen mit 100% handgekettelter, nahtloser Spitze. Entwickelt für moderne Modemarken und den anspruchsvollen Einzelhandel.',
      primaryButtonText: 'Musterdossier anfordern',
      secondaryButtonText: 'Kollektionen erkunden'
    },
    featureMatrixSection: {
      badge: 'Technische Architektur',
      title: 'Präzision bis auf den Mikrometer.',
      description: 'Jeder Faden ist auf maximale Langlebigkeit im Einzelhandel und reibungsfreien Tragekomfort ausgelegt.',
      bento1Tag: 'Garn-Architektur',
      bento1Title: '60s/2 Zweifach gekämmte Baumwolle.',
      bento1Description: 'Extralangstapelige gekämmte Fasern für langanhaltenden Anti-Pilling-Schutz (Stufe 4.5) und ein seidiges Zweite-Haut-Gefühl über 50+ Waschzyklen.',
      bento2Tag: 'Spitzenverarbeitung',
      bento2Title: 'Handgekettelt Nahtlos',
      bento2Description: 'Masche-für-Masche manuell verknüpft – verhindert störende Innennähte für druckfreien Tragekomfort an den Zehen.',
      bento2BadgeText: 'OEKO-TEX® 100 Klasse I',
      bento2BadgeStatus: 'Zertifiziert sicher',
      bento3Tag: 'Maschinenteilung',
      bento3Title: 'Lonati-Zylinder',
      bento3Description: 'Italienischer hochdichter Rundstrick für gestochen scharfe Feinripp-Strukturen ohne Verzug.',
      bento3FooterNote: 'Toleranz: ±0,5% Nadelteilung',
      bento4Tag: 'Elastizität',
      bento4Title: 'Lycra Soft-Stretch',
      bento4Description: 'Abgestufte Schaftspannung für sicheren Halt ohne Wadenabdrücke oder Einschnürungen.',
      bento4FooterNote: 'Kompatibel mit rutschfestem Silikon',
      bento5Tag: 'Mustergeschwindigkeit',
      bento5Title: 'Globaler Kurierversand',
      bento5Description: 'Kuratierte Stoffmusterbücher und individuelle Farbmusterabzüge innerhalb von 48 Stunden per DHL Express versandt.',
      bento5FooterNote: 'Großauftrag-Lieferzeit: 14 – 18 Werktage',
      primaryButtonText: 'Musterdossier anfordern',
      secondaryButtonText: 'Kollektionen erkunden'
    },
    productShowcaseSection: {
      badge: 'Kapsel-Katalog 2026',
      title: 'Sofort bestellbare Line-Sheets',
      subtitle: 'Exklusive Modelle, maßgeschneidert für White-Labeling, Marken-Individualisierung und flexible Nachbestellungen mit geringer Mindestmenge.',
      actionButtonText: 'Muster-Set anfordern',
      cardDetailsButtonText: 'Spezifikationen ansehen'
    },
    manufacturingSection: {
      badge: 'OEM / ODM & Private Label',
      headline: 'Vertikale Strick-Infrastruktur',
      subline: 'Von der Faserselektion bis zur verkaufsfertigen Verpackung bietet unsere intelligente Fertigungslinie maßgeschneiderte Lösungen mit schnellem Prototyping und globaler Exportkonformität.',
      actionButtonText: 'Musterdossier anfordern',
      capabilities: [
        {
          title: '350+ Lonati-Zylinder',
          description: 'Modernste italienische Ein- und Doppelzylindermaschinen für hochdichtes Stricken von 96N bis 200N Feinheit.'
        },
        {
          title: '72h Prototypenfertigung',
          description: 'Vom digitalen CAD-Schnittmuster zum physischen Funktionsmuster innerhalb von 72 Stunden mit Laborfarbabgleich.'
        },
        {
          title: 'Vollständiges Private-Labeling',
          description: 'Jacquard-Logos, Mikro-Stickerei, rutschfeste Silikonbeschichtungen, individuelle Pantone-Färbung und FSC-zertifizierte Verpackungen.'
        },
        {
          title: 'Null-Fehler-Qualitätsprüfung',
          description: '100% optische Kamerakontrolle und manuelle Dehnungsprüfungen. Vollständig Sedex-, BSCI- und ISO9001-zertifiziert.'
        }
      ]
    },
    inquirySection: {
      badge: 'B2B-Musterraum',
      headline: 'Fordern Sie Ihr kuratiertes Muster-Set an',
      subline: 'Erleben Sie die mikroskopische Haptik selbst. Verifizierte Modemarken, Einkaufsbüros und Designer erhalten kostenlose Musterbücher innerhalb von 48 Stunden.',
      buttonText: 'Musteranfrage senden',
      categories: ['Doppelvolant-Spitze', 'Maulbeerseide', 'Kaschmir-Seide', '15D Feinstrumpf'],
      successTitle: 'Musteranfrage bestätigt!',
      successMessage: 'Unser internationaler Kundenbetreuer hat Ihre Anfrage erhalten und wird das Musterdossier innerhalb von 48 Stunden per DHL Express versenden.'
    }
  },
  fr: {
    heroSection: {
      superTitle: 'Fabrication B2B & Atelier Marque Blanche',
      headline: 'Élégance de Pointe. Maille 200 Aiguilles.',
      subline: 'Tricoté sur des métiers circulaires italiens Lonati avec pointes remaillées main sans couture. Conçu pour les marques haut de gamme et le retail de luxe.',
      primaryButtonText: 'Demander le dossier d’échantillons',
      secondaryButtonText: 'Explorer les collections'
    },
    featureMatrixSection: {
      badge: 'Architecture Technique',
      title: 'Façonné au micron près.',
      description: 'Chaque fil est conçu pour une longévité commerciale irréprochable et un confort sans friction.',
      bento1Tag: 'Architecture du Fil',
      bento1Title: 'Coton Peigné Double Retors 60s/2.',
      bento1Description: 'Fibres peignées extra-longues pour une tenue anti-boulochage durable (Grade 4.5) et un toucher seconde peau sur plus de 50 lavages.',
      bento2Tag: 'Finition Pointeur',
      bento2Title: 'Rémaillage Main Sans Couture',
      bento2Description: 'Fermeture maille par maille éliminant tout bourrelet intérieur pour une pression nulle sur les orteils.',
      bento2BadgeText: 'OEKO-TEX® 100 Classe I',
      bento2BadgeStatus: 'Certifié sans risque',
      bento3Tag: 'Jauge Machine',
      bento3Title: 'Cylindres Lonati',
      bento3Description: 'Tricotage circulaire italien haute densité offrant une netteté absolue des micro-côtes sans déformation.',
      bento3FooterNote: 'Tolérance: ±0,5% d’écartement d’aiguilles',
      bento4Tag: 'Élasticité',
      bento4Title: 'Lycra Soft-Stretch',
      bento4Description: 'Bord-côte à tension progressive assurant une tenue parfaite sans marquer ni comprimer le mollet.',
      bento4FooterNote: 'Compatible avec bande silicone antiglisse',
      bento5Tag: 'Vitesse d’Échantillonnage',
      bento5Title: 'Expédition Express Mondiale',
      bento5Description: 'Nuanciers de tissus et échantillons de teinture sur mesure expédiés en 48 heures via DHL Express.',
      bento5FooterNote: 'Délai de production de gros: 14 – 18 jours ouvrés',
      primaryButtonText: 'Demander le dossier d’échantillons',
      secondaryButtonText: 'Explorer les collections'
    },
    productShowcaseSection: {
      badge: 'Catalogue Capsule 2026',
      title: 'Dossiers de Collections Prêts à Commander',
      subtitle: 'Silhouettes exclusives créées pour la marque blanche, la personnalisation sur mesure et le réassort rapide à faible quantité minimale.',
      actionButtonText: 'Demander un kit d’échantillons',
      cardDetailsButtonText: 'Voir les spécifications'
    },
    manufacturingSection: {
      badge: 'OEM / ODM & Marque Blanche',
      headline: 'Infrastructure de Tricotage Intégrée',
      subline: 'De la sélection des fibres au conditionnement final, notre ligne de production intelligente délivre des solutions sur mesure avec prototypage express et conformité mondiale.',
      actionButtonText: 'Demander le dossier d’échantillons',
      capabilities: [
        {
          title: 'Plus de 350 Métiers Lonati',
          description: 'Machines électroniques italiennes mono et double cylindre de 96 à 200 aiguilles pour un maillage de haute densité.'
        },
        {
          title: 'Prototypage Express 72h',
          description: 'Du patronage numérique CAO au prototype physique expédié sous 72 heures avec contrôle spectrophotométrique.'
        },
        {
          title: 'Personnalisation Intégrale',
          description: 'Logos jacquard, micro-broderie, semelles en silicone antidérapant, teinture Pantone dédiée et emballages certifiés FSC.'
        },
        {
          title: 'Contrôle Zéro Défaut',
          description: 'Inspection vidéo optique à 100% et tests d’élasticité manuels. Ateliers certifiés Sedex, BSCI et ISO9001.'
        }
      ]
    },
    inquirySection: {
      badge: 'Showroom Échantillons B2B',
      headline: 'Commandez Votre Kit d’Échantillons Dédié',
      subline: 'Touchez du doigt la précision microscopique de nos mailles. Les marques de mode et bureaux d’achat vérifiés reçoivent un dossier d’échantillons offert en 48h.',
      buttonText: 'Envoyer la demande',
      categories: ['Dentelle Double Volant', 'Soie de Mûrier', 'Cachemire-Soie', 'Collants Fins 15D'],
      successTitle: 'Demande d’échantillon confirmée !',
      successMessage: 'Notre responsable grands comptes a bien reçu votre demande et vous expédiera le dossier sous 48h via DHL Express.'
    }
  },
  es: {
    heroSection: {
      superTitle: 'Fabricación B2B y Taller de Marca Blanca',
      headline: 'Elegancia Técnica. Tejido Micro de 200 Agujas.',
      subline: 'Tejido en maquinaria italiana Lonati con punteras remalladas a mano 100% sin costuras. Diseñado para marcas de moda contemporáneas y comercio minorista de lujo.',
      primaryButtonText: 'Solicitar dossier de muestras',
      secondaryButtonText: 'Explorar colecciones'
    },
    featureMatrixSection: {
      badge: 'Arquitectura Técnica',
      title: 'Diseñado al milímetro.',
      description: 'Cada fibra está optimizada para ofrecer máxima durabilidad comercial y un tacto sin fricción.',
      bento1Tag: 'Estructura del Hilo',
      bento1Title: 'Algodón Peinado de Doble Cabo 60s/2.',
      bento1Description: 'Fibras peinadas de fibra extralarga para evitar la formación de bolitas (Grado 4.5) y un tacto de segunda piel tras más de 50 lavados.',
      bento2Tag: 'Cierre de Puntera',
      bento2Title: 'Remallado a Mano Sin Costuras',
      bento2Description: 'Enlazado bucle a bucle que suprime los rebordes interiores para eliminar cualquier presión en los dedos.',
      bento2BadgeText: 'OEKO-TEX® 100 Clase I',
      bento2BadgeStatus: 'Seguridad certificada',
      bento3Tag: 'Galga de Maquinaria',
      bento3Title: 'Cilindros Lonati',
      bento3Description: 'Tejido circular italiano de alta densidad que ofrece canales micro-rib de máxima nitidez sin deformación.',
      bento3FooterNote: 'Tolerancia: ±0,5% en paso de aguja',
      bento4Tag: 'Elasticidad',
      bento4Title: 'Lycra Soft-Stretch',
      bento4Description: 'Puño con tensión progresiva que sujeta firmemente sin marcar ni oprimir la pantorrilla.',
      bento4FooterNote: 'Compatible con inserciones de silicona antideslizante',
      bento5Tag: 'Velocidad de Muestreo',
      bento5Title: 'Envío Courier Global',
      bento5Description: 'Muestrarios de tejidos seleccionados y pruebas de laboratorio enviadas en 48 horas mediante DHL Express.',
      bento5FooterNote: 'Plazo de pedidos mayoristas: 14 – 18 días laborables',
      primaryButtonText: 'Solicitar dossier de muestras',
      secondaryButtonText: 'Explorar colecciones'
    },
    productShowcaseSection: {
      badge: 'Catálogo Cápsula 2026',
      title: 'Líneas Listas para Pedido',
      subtitle: 'Siluetas exclusivas desarrolladas para marca blanca, personalización completa y reposiciones mayoristas rápidas con bajo pedido mínimo.',
      actionButtonText: 'Solicitar kit de muestras',
      cardDetailsButtonText: 'Ver especificaciones'
    },
    manufacturingSection: {
      badge: 'OEM / ODM y Marca Blanca',
      headline: 'Infraestructura de Tejido Vertical',
      subline: 'Desde la selección de la fibra hasta el empaque final, nuestra línea de fabricación inteligente ofrece soluciones a medida con muestreo rápido y homologación exportadora.',
      actionButtonText: 'Solicitar dossier de muestras',
      capabilities: [
        {
          title: 'Más de 350 Cilindros Lonati',
          description: 'Maquinaria electrónica italiana de uno y dos cilindros capaz de tejer densidades desde 96 hasta 200 agujas.'
        },
        {
          title: 'Prototipado en 72 Horas',
          description: 'Del patrón digital CAD al prototipo físico despachado en 72 horas con control de tintura en laboratorio.'
        },
        {
          title: 'Marca Blanca Integral',
          description: 'Logotipos jacquard, micro-bordados, inserciones de silicona antideslizante, tintes Pantone y cajas con certificado FSC.'
        },
        {
          title: 'Auditoría Cero Defectos',
          description: 'Inspección por cámara óptica al 100% y ensayos manuales de elasticidad. Cumplimiento de normativas Sedex, BSCI e ISO9001.'
        }
      ]
    },
    inquirySection: {
      badge: 'Sala de Muestras B2B',
      headline: 'Solicite su Kit de Muestras Personalizado',
      subline: 'Compruebe en persona la suavidad microscópica de nuestros tejidos. Las marcas verificadas y oficinas de compras reciben muestrarios sin coste en 48 horas.',
      buttonText: 'Enviar solicitud de muestra',
      categories: ['Encaje Doble Volante', 'Seda de Morera', 'Cachemira y Seda', 'Medias Finas 15D'],
      successTitle: '¡Solicitud de muestra confirmada!',
      successMessage: 'Nuestro equipo de cuentas internacionales ha recibido su petición y le enviará el dossier por DHL Express en un plazo de 48 horas.'
    }
  }
};

/**
 * Universal Section Normalizer:
 * Enforces high-cohesion, centralized image optimization and edge proxy routing across all CMS section blocks.
 */
export function normalizeSections(sections: any[] = [], lang: SupportedLocale = DEFAULT_LOCALE): any[] {
  if (!Array.isArray(sections)) return [];

  return sections.map((section) => {
    if (!section || typeof section !== 'object') return section;
    const s = { ...section };

    // 1. Hero Sections (1600px High-Res Banner)
    if ((s._type === 'heroSection' || s._type === 'hosieryHeroSection') && s.heroImage) {
      s.heroImage = SanityImageService.hero(s.heroImage, 1600);
    }

    // 2. Technical Matrix / Specs Sections (1200px Macro Detail)
    if ((s._type === 'featureMatrixSection' || s._type === 'hosierySpecSection') && s.macroImage) {
      s.macroImage = SanityImageService.macro(s.macroImage, 1200);
    }

    // 3. Product Showcase / Collections Sections
    if ((s._type === 'productShowcaseSection' || s._type === 'hosieryCollectionSection') && Array.isArray(s.products)) {
      s.products = s.products.map((p: any) => {
        if (!p) return p;
        const mainImg = p.mainImage || (p.gallery && p.gallery[0]?.src);
        const localizedTitle = getLocalizedValue(p.title, lang);
        const localizedShortTitle = getLocalizedValue(p.shortTitle, lang) || localizedTitle;
        const localizedTagline = getLocalizedValue(p.tagline, lang);
        return {
          ...p,
          title: localizedTitle || p.title,
          shortTitle: localizedShortTitle || p.shortTitle,
          tagline: localizedTagline || p.tagline,
          mainImage: mainImg ? SanityImageService.thumbnail(mainImg, 700) : p.mainImage,
          gallery: Array.isArray(p.gallery)
            ? p.gallery.map((g: any) => ({
                ...g,
                src: g?.src ? SanityImageService.thumbnail(g.src, 700) : g?.src,
              }))
            : p.gallery,
        };
      });
    }

    // 4. Custom Bento / Modular Sections
    if (s._type === 'customSection' && Array.isArray(s.blocks)) {
      s.blocks = s.blocks.map((b: any) => {
        if (!b) return b;
        const block = { ...b };
        if (block._type === 'mediaBlock') {
          if (block.image) block.image = SanityImageService.hero(block.image, 1600);
          if (block.secondaryImage) block.secondaryImage = SanityImageService.hero(block.secondaryImage, 1200);
        } else if (block._type === 'bentoCardBlock' && Array.isArray(block.cards)) {
          block.cards = block.cards.map((c: any) => ({
            ...c,
            image: c?.image ? SanityImageService.thumbnail(c.image, 800) : c?.image,
          }));
        } else if (block._type === 'quoteBlock' && block.avatar) {
          block.avatar = SanityImageService.avatar(block.avatar, 120);
        }
        return block;
      });
    }

    // 5. Automatic High-Precision Multilingual Content Injection for Sections
    if (lang && lang !== DEFAULT_LOCALE) {
      const transKey = s._type === 'hosieryHeroSection' ? 'heroSection'
        : s._type === 'hosierySpecSection' ? 'featureMatrixSection'
        : s._type === 'hosieryCollectionSection' ? 'productShowcaseSection'
        : s._type === 'hosieryManufacturingSection' ? 'manufacturingSection'
        : s._type === 'hosieryInquirySection' ? 'inquirySection'
        : s._type;

      const trans = SECTION_TRANSLATIONS[lang]?.[transKey];
      if (trans) {
        Object.keys(trans).forEach((key) => {
          if (key === 'capabilities' && Array.isArray(trans.capabilities)) {
            if (Array.isArray(s.capabilities) && s.capabilities.length > 0) {
              s.capabilities = s.capabilities.map((cap: any, idx: number) => {
                const capTrans = trans.capabilities[idx];
                if (!capTrans) return cap;
                return {
                  ...cap,
                  title: (cap.title && typeof cap.title === 'object' ? getLocalizedValue(cap.title, lang) : '') || capTrans.title || cap.title,
                  description: (cap.description && typeof cap.description === 'object' ? getLocalizedValue(cap.description, lang) : '') || capTrans.description || cap.description,
                };
              });
            } else {
              s.capabilities = trans.capabilities;
            }
          } else if (key === 'categories' && Array.isArray(trans.categories)) {
            s.categories = trans.categories;
          } else {
            // Priority: CMS localized object > professional dictionary > original
            const cmsVal = s[key] && typeof s[key] === 'object' ? getLocalizedValue(s[key], lang) : '';
            s[key] = cmsVal || trans[key] || s[key];
          }
        });
      } else {
        // Fallback for custom sections: resolve any object fields
        ['title', 'headline', 'subline', 'subtitle', 'badge', 'superTitle', 'description', 'primaryButtonText', 'secondaryButtonText', 'actionButtonText'].forEach((f) => {
          if (s[f] && typeof s[f] === 'object') {
            s[f] = getLocalizedValue(s[f], lang);
          }
        });
      }
    }

    return s;
  });
}

/**
 * Resolves the responsive LCP preload descriptor from sections if a Hero section is present.
 * High-cohesion utility ensuring all section-based pages (homepage & dynamic slug pages) share SSOT preloading.
 */
export function extractHeroPreload(sections: any[] = []): { src: string; srcset?: string; sizes?: string } | undefined {
  if (!Array.isArray(sections)) return undefined;
  const heroSection = sections.find((s: any) => s && (s._type === 'heroSection' || s._type === 'hosieryHeroSection'));
  if (!heroSection) return undefined;
  const rawHeroImg = heroSection.heroImage || DEFAULT_FALLBACK_IMAGE;
  return SanityImageService.resolveHeroPreload(rawHeroImg);
}
