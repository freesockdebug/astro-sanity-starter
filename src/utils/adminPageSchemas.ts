// src/utils/adminPageSchemas.ts
// Extracted section presets, metadata, and isolated field specs for /admin/pages builder

import type { FieldSpec } from '@utils/adminWorkbench';

export const SECTION_TYPE_META: Record<string, { label: string; badgeClass: string }> = {
  heroSection: { label: 'Hero Banner · heroSection', badgeClass: 'bg-amber-100 text-amber-900 border-amber-200' },
  productShowcaseSection: { label: 'Product Showcase · productShowcase', badgeClass: 'bg-blue-100 text-blue-900 border-blue-200' },
  featureMatrixSection: { label: 'Spec Matrix · featureMatrix', badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200' },
  manufacturingSection: { label: 'Manufacturing · manufacturing', badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  inquirySection: { label: 'Sample Inquiry · inquirySection', badgeClass: 'bg-rose-100 text-rose-900 border-rose-200' },
  customSection: { label: 'Custom Layout · customSection', badgeClass: 'bg-purple-100 text-purple-900 border-purple-200' },
};

export function getSectionInitialValues(type: string) {
  const baseKey = crypto.randomUUID().slice(0, 8);
  switch (type) {
    case 'heroSection':
      return {
        _key: baseKey,
        _type: 'heroSection',
        adminLabel: 'Hero Cover',
        superTitle: {
          _type: 'localeString',
          en: 'B2B Manufacturing & Private Label Atelier',
          de: 'B2B-Herstellung & Private-Label-Atelier',
          fr: 'Fabrication B2B & Atelier Marque Blanche',
          es: 'Fabricación B2B y Taller de Marca Blanca',
        },
        headline: {
          _type: 'localeString',
          en: 'Engineered Elegance. 200-Needle Micro Weave.',
          de: 'Raffinierte Eleganz. 200-Nadel-Mikrostrick.',
          fr: 'Élégance de Pointe. Maille 200 Aiguilles.',
          es: 'Elegancia Técnica. Tejido Micro de 200 Agujas.',
        },
        subline: {
          _type: 'localeText',
          en: 'Knitted on Italian Lonati machinery with 100% artisan hand-linked seamless toes. Built for modern private-label brands and luxury retail.',
          de: 'Gestrickt auf italienischen Lonati-Maschinen mit 100% handgekettelter, nahtloser Spitze.',
          fr: 'Tricoté sur des métiers circulaires italiens Lonati avec pointes remaillées main sans couture.',
          es: 'Tejido en maquinaria italiana Lonati con punteras remalladas a mano 100% sin costuras.',
        },
        showPrimaryButton: true,
        primaryButtonText: {
          _type: 'localeString',
          en: 'Request Swatch Kit',
          de: 'Musterdossier anfordern',
          fr: 'Demander le dossier d’échantillons',
          es: 'Solicitar dossier de muestras',
        },
        primaryButtonUrl: '#inquiry',
        swatchSku: '',
        showSecondaryButton: true,
        secondaryButtonText: {
          _type: 'localeString',
          en: 'Explore Capsule Lines',
          de: 'Kapselkollektionen entdecken',
          fr: 'Découvrir nos lignes capsule',
          es: 'Explorar líneas cápsula',
        },
        secondaryButtonUrl: '/products',
      };

    case 'productShowcaseSection':
      return {
        _key: baseKey,
        _type: 'productShowcaseSection',
        adminLabel: 'Collection Gallery',
        badge: {
          _type: 'localeString',
          en: 'Capsule Catalog 2026',
          de: 'Kapsel-Katalog 2026',
          fr: 'Catalogue Capsule 2026',
          es: 'Catálogo Cápsula 2026',
        },
        title: {
          _type: 'localeString',
          en: 'Ready-to-Order Line Sheets',
          de: 'Sofort bestellbare Line-Sheets',
          fr: 'Dossiers de Collections Prêts à Commander',
          es: 'Líneas Listas para Pedido',
        },
        subtitle: {
          _type: 'localeText',
          en: 'Proprietary silhouettes developed for white-labeling, brand customization, and low-MOQ rapid wholesale reordering.',
          de: 'Exklusive Modelle, maßgeschneidert für White-Labeling und flexible Nachbestellungen.',
          fr: 'Silhouettes exclusives créées pour la marque blanche et le réassort rapide.',
          es: 'Siluetas exclusivas desarrolladas para marca blanca y reposiciones mayoristas rápidas.',
        },
        products: [],
        showActionButton: true,
        actionButtonText: {
          _type: 'localeString',
          en: 'Request Swatch Kit',
          de: 'Muster-Set anfordern',
          fr: 'Demander un kit d’échantillons',
          es: 'Solicitar kit de muestras',
        },
        actionButtonUrl: '#inquiry',
        swatchSku: '',
        showCardQuoteButton: true,
        cardDetailsButtonText: {
          _type: 'localeString',
          en: 'Inspect Specs',
          de: 'Spezifikationen prüfen',
          fr: 'Voir les spécifications',
          es: 'Ver especificaciones',
        },
      };

    case 'featureMatrixSection':
      return {
        _key: baseKey,
        _type: 'featureMatrixSection',
        adminLabel: 'Spec Matrix',
        badge: {
          _type: 'localeString',
          en: 'Engineered Construction',
          de: 'Technische Architektur',
          fr: 'Architecture Technique',
          es: 'Arquitectura Técnica',
        },
        title: {
          _type: 'localeString',
          en: 'Specification Matrix',
          de: 'Präzision bis auf den Mikrometer.',
          fr: 'Façonné au micron près.',
          es: 'Diseñado al milímetro.',
        },
        description: {
          _type: 'localeText',
          en: 'Every seam, tension zone, and yarn twist is calibrated for zero friction.',
          de: 'Jeder Faden ist auf maximale Langlebigkeit im Einzelhandel ausgelegt.',
          fr: 'Chaque fil est conçu pour une longévité commerciale irréprochable.',
          es: 'Cada fibra está optimizada para ofrecer máxima durabilidad comercial.',
        },
        bento1Tag: { _type: 'localeString', en: 'Yarn Architecture', de: 'Garn-Architektur', fr: 'Architecture du Fil', es: 'Estructura del Hilo' },
        bento1Title: { _type: 'localeString', en: '60s/2 Double-Ply Combed Cotton.', de: '60s/2 Zweifach gekämmte Baumwolle.', fr: 'Coton peigné double retors 60s/2.', es: 'Algodón peinado de doble cabo 60s/2.' },
        bento1Description: { _type: 'localeText', en: 'Long-staple fibers singed and mercerized for pill-free lustre.', de: 'Gekämmte Langstapelfasern mit seidenmattem Glanz.', fr: 'Fibres longues peignées et mercerisées pour un éclat soyeux.', es: 'Fibras largas peinadas y mercerizadas para un brillo sedoso.' },
        bento2Tag: { _type: 'localeString', en: 'Artisan Finish', de: 'Handwerkliche Präzision', fr: 'Finition Artisanale', es: 'Acabado Artesanal' },
        bento2Title: { _type: 'localeString', en: 'Hand-Linked 0mm Seam.', de: 'Handgekettelte 0mm-Naht.', fr: 'Remaillage main 0mm.', es: 'Puntera remallada a mano 0mm.' },
        bento2Description: { _type: 'localeText', en: 'Completely flat toe seam plane eliminating pressure points.', de: 'Absolut flache Spitzenverbindung ohne Druckstellen.', fr: 'Couture parfaitement plate éliminant les frottements.', es: 'Costura plana sin rozaduras ni puntos de presión.' },
        bento2BadgeText: { _type: 'localeString', en: 'OEKO-TEX Class 1', de: 'OEKO-TEX Klasse 1', fr: 'OEKO-TEX Classe 1', es: 'OEKO-TEX Clase 1' },
        bento2BadgeStatus: { _type: 'localeString', en: 'Verified Safe', de: 'Zertifiziert', fr: 'Certifié Conforme', es: 'Certificado Seguro' },
        bento3Tag: { _type: 'localeString', en: 'Needle Density', de: 'Maschendichte', fr: 'Densité de Maille', es: 'Densidad de Tejido' },
        bento3Title: { _type: 'localeString', en: '200N High-Gauge Weave.', de: '200N Feinstrick-Dichte.', fr: 'Maille haute jauge 200N.', es: 'Galgas finas 200N.' },
        bento3Description: { _type: 'localeText', en: 'Dual-cylinder Italian Lonati machinery for sculpted arch fit.', de: 'Italienische Doppelzylinder-Maschinen für anatomischen Halt.', fr: 'Métiers italiens double cylindre pour un maintien anatomique.', es: 'Maquinaria italiana para un ajuste anatómico.' },
        bento3FooterNote: { _type: 'localeString', en: 'Lonati Dual Cylinder · 200 Needle Precision', de: 'Lonati Doppelzylinder · 200-Nadel-Präzision', fr: 'Double cylindre Lonati · Précision 200 aiguilles', es: 'Doble cilindro Lonati · Precisión 200 agujas' },
        bento4Tag: { _type: 'localeString', en: 'Compression Arch', de: 'Kompressions-Passform', fr: 'Maintien Élastique', es: 'Soporte Elástico' },
        bento4Title: { _type: 'localeString', en: 'ZeroMark Lycra Rib.', de: 'ZeroMark Lycra-Bündchen.', fr: 'Bord-côtes Lycra ZeroMark.', es: 'Puño elástico Lycra ZeroMark.' },
        bento4Description: { _type: 'localeText', en: 'Gentle stay-up tension without leaving constricting marks.', de: 'Sanfter Halt ohne Druckstellen an der Wade.', fr: 'Tenue souple sans marquer le mollet.', es: 'Ajuste suave sin dejar marcas en la pantorrilla.' },
        bento4FooterNote: { _type: 'localeString', en: 'Zero Constriction · High Elastic Memory', de: 'Druckfreier Halt · Hohe Rücksprungkraft', fr: 'Sans compression excessive · Haute mémoire élastique', es: 'Sin marcas de presión · Gran memoria elástica' },
        bento5Tag: { _type: 'localeString', en: 'Prototyping SLA', de: 'Musterungs-SLA', fr: 'SLA Prototypage', es: 'Plazos de Muestreo' },
        bento5Title: { _type: 'localeString', en: '48-Hour Rapid Dispatch.', de: '48h Express-Musterung.', fr: 'Expédition échantillons 48h.', es: 'Muestreo express 48h.' },
        bento5Description: { _type: 'localeText', en: 'Curated physical swatch cards dispatched globally via DHL.', de: 'Musterkarten weltweit per Express versendet.', fr: 'Dossiers expédiés par coursier express dans le monde entier.', es: 'Muestrarios enviados por mensajería urgente a todo el mundo.' },
        bento5FooterNote: { _type: 'localeString', en: 'Global Courier Dispatch · Air Express', de: 'Weltweiter Expressversand', fr: 'Expédition express internationale', es: 'Envío express internacional' },
        showPrimaryButton: true,
        primaryButtonText: { _type: 'localeString', en: 'Request Swatch Kit', de: 'Musterdossier anfordern', fr: 'Demander le dossier', es: 'Solicitar dossier' },
        primaryButtonUrl: '#inquiry',
        swatchSku: '',
        showSecondaryButton: false,
        secondaryButtonText: { _type: 'localeString', en: 'Explore All Specs', de: 'Alle Spezifikationen', fr: 'Toutes les spécifications', es: 'Ver especificaciones' },
        secondaryButtonUrl: '/products',
      };

    case 'manufacturingSection':
      return {
        _key: baseKey,
        _type: 'manufacturingSection',
        adminLabel: 'Manufacturing Atelier',
        badge: { _type: 'localeString', en: 'OEM / ODM & Private Label', de: 'OEM / ODM & Private Label', fr: 'OEM / ODM & Marque Blanche', es: 'OEM / ODM y Marca Blanca' },
        headline: { _type: 'localeString', en: 'Vertical Knitting Infrastructure', de: 'Vertikale Strick-Infrastruktur', fr: 'Infrastructure de Tricotage Intégrée', es: 'Infraestructura de Tejido Vertical' },
        subline: { _type: 'localeText', en: 'From spinning fiber selection to finished packaging, our smart line delivers bespoke solutions with rapid prototyping.', de: 'Von der Faser bis zur Verpackung liefert unsere Fertigungslinie maßgeschneiderte Lösungen.', fr: 'De la fibre au conditionnement, notre ligne intégrée livre des solutions complètes.', es: 'De la fibra al empaque final, nuestra línea vertical ofrece soluciones completas.' },
        capabilities: [
          {
            _key: crypto.randomUUID().slice(0, 8),
            title: { _type: 'localeString', en: 'Lonati 200N Machine Fleet', de: 'Lonati 200N Maschinenpark', fr: 'Parc Métiers Lonati 200N', es: 'Flota de Máquinas Lonati 200N' },
            description: { _type: 'localeText', en: '350+ automated dual-cylinder Italian circular knitting units with optical yarn sensors.', de: 'Über 350 italienische Doppelzylinder-Strickmaschinen mit optischen Sensoren.', fr: 'Plus de 350 métiers circulaires italiens avec capteurs optiques.', es: 'Más de 350 telares circulares italianos con sensores ópticos.' }
          },
          {
            _key: crypto.randomUUID().slice(0, 8),
            title: { _type: 'localeString', en: 'Artisan Hand-Linking Atelier', de: 'Handkettel-Manufaktur', fr: 'Atelier de Remaillage Main', es: 'Taller de Remallado Artesanal' },
            description: { _type: 'localeText', en: 'Zero-ridge seamless toe closures inspected one-by-one by master craftsmen.', de: 'Nahtlose Spitzenverbindung von Handwerksmeistern einzeln geprüft.', fr: 'Pointes remaillées main contrôlées à l’unité par des artisans experts.', es: 'Remallado plano inspeccionado individualmente por artesanos.' }
          },
          {
            _key: crypto.randomUUID().slice(0, 8),
            title: { _type: 'localeString', en: 'OEKO-TEX & BSCI Certified', de: 'OEKO-TEX & BSCI Zertifiziert', fr: 'Certifié OEKO-TEX & BSCI', es: 'Certificación OEKO-TEX y BSCI' },
            description: { _type: 'localeText', en: 'Non-toxic eco-reactive dyes complying with EU REACH luxury standards.', de: 'Umweltfreundliche Reaktivfarbstoffe nach EU-REACH-Luxusstandards.', fr: 'Teintures réactives écologiques conformes aux exigences européennes REACH.', es: 'Tintes reactivos ecológicos que cumplen la estricta normativa EU REACH.' }
          }
        ],
        showActionButton: true,
        actionButtonText: { _type: 'localeString', en: 'Request Factory Dossier', de: 'Werksunterlagen anfordern', fr: 'Demander le dossier usine', es: 'Solicitar dossier de fábrica' },
        actionButtonUrl: '#inquiry',
        swatchSku: '',
      };

    case 'inquirySection':
      return {
        _key: baseKey,
        _type: 'inquirySection',
        adminLabel: 'Swatch Inquiry',
        badge: { _type: 'localeString', en: 'B2B Sample Room', de: 'B2B-Musterraum', fr: 'Showroom Échantillons B2B', es: 'Sala de Muestras B2B' },
        headline: { _type: 'localeString', en: 'Request Your Curated Swatch Kit', de: 'Fordern Sie Ihr kuratiertes Muster-Set an', fr: 'Commandez Votre Kit d’Échantillons Dédié', es: 'Solicite su Kit de Muestras Personalizado' },
        subline: { _type: 'localeText', en: 'Verified fashion labels receive curated swatch books dispatched within 48 hours.', de: 'Verifizierte Modemarken erhalten Musterbücher innerhalb von 48 Stunden.', fr: 'Les marques vérifiées reçoivent un dossier d’échantillons offert en 48h.', es: 'Las marcas verificadas reciben muestrarios sin coste en 48 horas.' },
        categories: ['Mulberry Silk', 'Fine Cashmere', 'Combed Cotton 60s', 'Merino Wool'],
        successTitle: { _type: 'localeString', en: 'Sample Request Dispatched', de: 'Musteranforderung übermittelt', fr: 'Demande d’échantillons transmise', es: 'Solicitud de muestra enviada' },
        successMessage: { _type: 'localeText', en: 'Our B2B trade desk has received your request and will contact you via WhatsApp / Email.', de: 'Unser B2B-Team wird Sie kontaktieren.', fr: 'Notre équipe B2B prendra contact avec vous.', es: 'Nuestro equipo se pondrá en contacto.' },
        showSection: true,
        showButton: true,
        buttonText: { _type: 'localeString', en: 'Dispatch Swatch Kit', de: 'Muster-Set versenden', fr: 'Expédier le dossier', es: 'Enviar kit de muestras' },
        swatchSku: '',
      };

    case 'customSection':
    default:
      return {
        _key: baseKey,
        _type: 'customSection',
        adminLabel: 'Custom Section',
        preset: 'dual-compare',
        theme: 'light',
        sectionHeight: 'screen-fit',
        verticalAlign: 'center',
        containerWidth: 'wide',
        paddingY: 'standard',
        layoutMode: 'flow',
        blocks: [
          {
            _key: crypto.randomUUID().slice(0, 8),
            _type: 'headingBlock',
            badge: 'ATELIER SHOWCASE',
            headline: 'Bespoke Private Label Craftsmanship.',
            subtitle: 'Precision gauge knitting tailored for premier apparel houses.',
            align: 'center',
            size: 'medium',
          }
        ],
      };
  }
}

export const SECTION_FIELD_SPECS: Record<string, FieldSpec[]> = {
  heroSection: [
    { key: 'adminLabel', label: 'Admin Label', type: 'text', col: 6, placeholder: 'e.g. Home Hero Banner' },
    { key: 'superTitle', label: 'Super Title (Eyebrow)', type: 'localeString', col: 6 },
    { key: 'headline', label: 'Main Headline', type: 'localeString', col: 12, bold: true },
    { key: 'subline', label: 'Subline Narrative', type: 'localeText', col: 12 },
    { key: 'showPrimaryButton', label: 'Primary Button', type: 'checkbox', col: 3 },
    { key: 'primaryButtonText', label: 'Primary Button Text', type: 'localeString', col: 3 },
    { key: 'primaryButtonUrl', label: 'Primary Link', type: 'text', col: 3, mono: true, placeholder: 'e.g. #inquiry' },
    { key: 'swatchSku', label: 'Custom Swatch SKU', type: 'text', col: 3, mono: true },
    { key: 'showSecondaryButton', label: 'Secondary Button', type: 'checkbox', col: 4 },
    { key: 'secondaryButtonText', label: 'Secondary Button Text', type: 'localeString', col: 4 },
    { key: 'secondaryButtonUrl', label: 'Secondary Link', type: 'text', col: 4, mono: true, placeholder: 'e.g. /products' },
  ],
  productShowcaseSection: [
    { key: 'adminLabel', label: 'Admin Label', type: 'text', col: 4 },
    { key: 'badge', label: 'Badge', type: 'localeString', col: 4 },
    { key: 'title', label: 'Section Title', type: 'localeString', col: 4, bold: true },
    { key: 'subtitle', label: 'Subtitle', type: 'localeText', col: 12 },
    { key: 'showActionButton', label: 'Top Action Button', type: 'checkbox', col: 3 },
    { key: 'actionButtonText', label: 'Action Button Text', type: 'localeString', col: 3 },
    { key: 'actionButtonUrl', label: 'Action Link', type: 'text', col: 3, mono: true, placeholder: 'e.g. #inquiry' },
    { key: 'swatchSku', label: 'Custom Swatch SKU', type: 'text', col: 3, mono: true },
    { key: 'showCardQuoteButton', label: 'Show Card "Add to Quote" Button', type: 'checkbox', col: 6, placeholder: 'defaultTrue' },
    { key: 'cardDetailsButtonText', label: 'Card Details Button Text', type: 'localeString', col: 6 },
  ],
  featureMatrixSection: [
    { key: 'adminLabel', label: 'Admin Label', type: 'text', col: 4 },
    { key: 'badge', label: 'Badge', type: 'localeString', col: 4 },
    { key: 'title', label: 'Matrix Title', type: 'localeString', col: 4, bold: true },
    { key: 'description', label: 'Description', type: 'localeText', col: 12 },
    ...[1, 2, 3, 4, 5].flatMap((n): FieldSpec[] => [
      { key: `bento${n}Tag`, label: `Bento ${n} Tag`, type: 'localeString', col: 4 },
      { key: `bento${n}Title`, label: `Bento ${n} Title`, type: 'localeString', col: 8, bold: true },
      { key: `bento${n}Description`, label: `Bento ${n} Description`, type: 'localeText', col: 12 },
      ...(n === 2
        ? ([
            { key: 'bento2BadgeText', label: 'Bento 2 Badge Text', type: 'localeString', col: 6 },
            { key: 'bento2BadgeStatus', label: 'Bento 2 Badge Status', type: 'localeString', col: 6 },
          ] as FieldSpec[])
        : n >= 3
        ? ([{ key: `bento${n}FooterNote`, label: `Bento ${n} Footer Note`, type: 'localeString', col: 12 }] as FieldSpec[])
        : []),
    ]),
    { key: 'showPrimaryButton', label: 'Primary Button', type: 'checkbox', col: 3 },
    { key: 'primaryButtonText', label: 'Primary Text', type: 'localeString', col: 3 },
    { key: 'primaryButtonUrl', label: 'Primary Link', type: 'text', col: 3, mono: true },
    { key: 'swatchSku', label: 'Swatch SKU', type: 'text', col: 3, mono: true },
    { key: 'showSecondaryButton', label: 'Secondary Button', type: 'checkbox', col: 4 },
    { key: 'secondaryButtonText', label: 'Secondary Text', type: 'localeString', col: 4 },
    { key: 'secondaryButtonUrl', label: 'Secondary Link', type: 'text', col: 4, mono: true },
  ],
  manufacturingSection: [
    { key: 'adminLabel', label: 'Admin Label', type: 'text', col: 4 },
    { key: 'badge', label: 'Badge', type: 'localeString', col: 4 },
    { key: 'headline', label: 'Headline', type: 'localeString', col: 4, bold: true },
    { key: 'subline', label: 'Subline', type: 'localeText', col: 12 },
    { key: 'showActionButton', label: 'Show Action Button', type: 'checkbox', col: 3 },
    { key: 'actionButtonText', label: 'Action Button Text', type: 'localeString', col: 3 },
    { key: 'actionButtonUrl', label: 'Action Link', type: 'text', col: 3, mono: true },
    { key: 'swatchSku', label: 'Swatch SKU', type: 'text', col: 3, mono: true },
  ],
  inquirySection: [
    { key: 'adminLabel', label: 'Admin Label', type: 'text', col: 4 },
    { key: 'badge', label: 'Badge', type: 'localeString', col: 4 },
    { key: 'headline', label: 'Headline', type: 'localeString', col: 4, bold: true },
    { key: 'subline', label: 'Subline', type: 'localeText', col: 12 },
    { key: 'categories', label: 'Sample Swatch Categories (Comma-separated)', type: 'csv', col: 12, placeholder: 'e.g. Mulberry Silk, Fine Cashmere, Merino Wool' },
    { key: 'showSection', label: 'Show Section', type: 'checkbox', col: 3, placeholder: 'defaultTrue' },
    { key: 'showButton', label: 'Show Submit', type: 'checkbox', col: 3, placeholder: 'defaultTrue' },
    { key: 'buttonText', label: 'Submit Button Text', type: 'localeString', col: 3 },
    { key: 'swatchSku', label: 'Swatch SKU', type: 'text', col: 3, mono: true },
    { key: 'successTitle', label: 'Success Title', type: 'localeString', col: 6, placeholder: 'Sample Request Dispatched' },
    { key: 'successMessage', label: 'Success Message', type: 'localeText', col: 6, placeholder: 'Our team will contact you...' },
  ],
  customSection: [
    { key: 'adminLabel', label: 'Admin Label', type: 'text', col: 4 },
    {
      key: 'preset', label: 'Screen Preset', type: 'select', col: 4,
      options: [
        { value: 'dual-compare', label: 'Dual Compare (Atelier)' },
        { value: 'cinematic-hero', label: 'Cinematic Full-Width' },
        { value: 'split-showcase', label: 'Split Showcase (6:4)' },
        { value: 'bento-grid', label: 'Bento Matrix Grid' },
        { value: 'custom-free', label: 'Custom Freeform' },
      ],
    },
    {
      key: 'theme', label: 'Surface Theme', type: 'select', col: 4,
      options: [
        { value: 'light', label: 'Clean Light' },
        { value: 'subtle', label: 'Subtle Gray' },
        { value: 'dark', label: 'Onyx Dark' },
        { value: 'gradient-dark', label: 'Obsidian Gradient' },
      ],
    },
    {
      key: 'sectionHeight', label: 'Height Mode', type: 'select', col: 2,
      options: [
        { value: 'screen-fit', label: '100dvh Exact Fit' },
        { value: 'screen-min', label: 'Min 100dvh' },
        { value: 'screen-75', label: '75dvh Focus' },
        { value: 'screen-50', label: '50dvh Half' },
        { value: 'auto', label: 'Auto Content' },
      ],
    },
    {
      key: 'verticalAlign', label: 'Vertical Align', type: 'select', col: 2,
      options: [
        { value: 'center', label: 'Center' },
        { value: 'top', label: 'Top' },
        { value: 'bottom', label: 'Bottom' },
      ],
    },
    {
      key: 'containerWidth', label: 'Container Width', type: 'select', col: 3,
      options: [
        { value: 'wide', label: 'Wide (7xl)' },
        { value: 'narrow', label: 'Narrow (3xl)' },
        { value: 'full', label: 'Full Bleed' },
      ],
    },
    {
      key: 'paddingY', label: 'Padding Y', type: 'select', col: 3,
      options: [
        { value: 'standard', label: 'Standard (96px)' },
        { value: 'compact', label: 'Compact (48px)' },
        { value: 'spacious', label: 'Spacious (144px)' },
        { value: 'none', label: 'None (0px)' },
      ],
    },
    {
      key: 'layoutMode', label: 'Layout Mode', type: 'select', col: 2,
      options: [
        { value: 'flow', label: 'Flow Stream' },
        { value: 'split-50-50', label: 'Split 5:5' },
        { value: 'split-60-40', label: 'Split 6:4' },
        { value: 'split-40-60', label: 'Split 4:6' },
      ],
    },
  ],
};

export const CAPABILITY_FIELDS: FieldSpec[] = [
  { key: 'title', label: 'Title', type: 'localeString', col: 12, bold: true },
  { key: 'description', label: 'Description', type: 'localeText', col: 12 },
];

export const BLOCK_FIELD_SPECS: Record<string, FieldSpec[]> = {
  headingBlock: [
    { key: 'badge', label: 'Eyebrow Badge', type: 'text', col: 6 },
    {
      key: 'align', label: 'Align', type: 'select', col: 6,
      options: [
        { value: 'center', label: 'Center' },
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
      ],
    },
    { key: 'headline', label: 'Headline', type: 'text', col: 12, bold: true },
    { key: 'subtitle', label: 'Subtitle / Narrative text', type: 'textarea', col: 12 },
  ],
  mediaBlock: [
    { key: 'caption', label: 'Image Caption / Note', type: 'text', col: 12 },
  ],
  quoteBlock: [
    { key: 'quote', label: 'Quote Text', type: 'textarea', col: 12 },
    { key: 'author', label: 'Author Name', type: 'text', col: 6 },
    { key: 'role', label: 'Role / Company', type: 'text', col: 6 },
  ],
  default: [
    { key: 'headline', label: 'Headline or Content', type: 'text', col: 12 },
    { key: 'subtitle', label: 'Subtitle or Link URL', type: 'text', col: 12 },
  ],
};
