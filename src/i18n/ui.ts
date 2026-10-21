// src/i18n/ui.ts

export const LANGUAGES = {
  en: { code: 'en', label: 'English', short: 'EN', flag: '🇬🇧' },
  de: { code: 'de', label: 'Deutsch', short: 'DE', flag: '🇩🇪' },
  fr: { code: 'fr', label: 'Français', short: 'FR', flag: '🇫🇷' },
  es: { code: 'es', label: 'Español', short: 'ES', flag: '🇪🇸' },
} as const;

export type SupportedLocale = keyof typeof LANGUAGES;
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const UI_STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.products': 'Products',
    'nav.about': 'About Us',
    'nav.privateLabel': 'Private Label',
    'nav.contact': 'Contact',
    'nav.rfq': 'Inquiry List',
    'nav.language': 'Language',

    // Product Catalog
    'catalog.showing': 'Showing',
    'catalog.of': 'of',
    'catalog.styles': 'styles',
    'catalog.allSilhouettes': 'All Silhouettes',
    'catalog.filterBy': 'Filter by Category',
    'catalog.viewDetail': 'View Specs & MOQ',
    'catalog.quickInquiry': 'Quick Inquiry',
    'catalog.leadTime': 'Sampling Lead: 48h',
    'catalog.moqPrefix': 'MOQ',
    'catalog.sortFeatured': 'Featured Styles',
    'catalog.sortMoq': 'MOQ: Low to High',
    'catalog.sortTitle': 'Title: A to Z',
    'catalog.loadingMore': 'Loading more styles...',
    'catalog.resetFilters': 'Reset All Filters',
    'catalog.browseAll': 'Browse All',
    'catalog.requestQuote': 'Request Quote',

    // Product Detail Page (PDP)
    'pdp.addToQuote': 'Add to Quote Basket',
    'pdp.buySampleAmazon': 'Buy Sample on Amazon',
    'pdp.downloadSpec': 'Request Tech Pack / PDF',
    'pdp.downloadSpecSheet': 'Download Spec Sheet (PDF)',
    'pdp.specs': 'Manufacturing Specifications',
    'pdp.wholesaleTiers': 'Wholesale Volume Pricing',
    'pdp.unitPrice': 'Unit Price',
    'pdp.prev': 'Prev',
    'pdp.next': 'Next',
    'pdp.prevSilhouette': 'Previous Silhouette',
    'pdp.nextSilhouette': 'Next Silhouette',
    'pdp.colorway': 'Available Colorways',
    'pdp.samplingNotice': 'Factory direct prototyping available in 48-72h with custom brand cards.',
    'pdp.needleGauge': 'Needle Gauge',
    'pdp.linking': 'Toe Linking',
    'pdp.composition': 'Composition',
    'pdp.sizing': 'Sizing Standard',

    // RFQ Drawer
    'rfq.drawerTitle': 'B2B Inquiry & Sample Dossier',
    'rfq.emptyMessage': 'Your inquiry basket is empty. Select styles from the catalog.',
    'rfq.submitQuote': 'Submit Official RFQ',
    'rfq.sampleRequest': 'Request Swatch & Prototype',
    'rfq.companyPlaceholder': 'Company / Brand Name *',
    'rfq.buyerNamePlaceholder': 'Buyer Name',
    'rfq.emailPlaceholder': 'Work Email Address *',
    'rfq.phonePlaceholder': 'WhatsApp / Phone',
    'rfq.destinationPlaceholder': 'Shipping Country & City (for freight estimate)',
    'rfq.requirementsPlaceholder': 'Customization requirements (Custom logo, Pantone color, packaging, target price)...',
    'rfq.clearAll': 'Clear all',
    'rfq.remove': 'Remove',

    // Section Hints
    'collections.swipeHint': 'Swipe to explore all silhouettes',
    'collections.scrollHint': 'Scroll horizontally or use arrows to explore all silhouettes',
    'specs.swipeHint': 'Swipe to explore 5 technical specs',
    'manufacturing.swipeHint': 'Swipe to view capabilities',

    // Stages
    'stage.overview': 'Overview',
    'stage.specs': 'Specification',
    'stage.collections': 'Silhouettes',
    'stage.infrastructure': 'Infrastructure',
    'stage.sampleRequest': 'Sample Request',

    // General
    'common.backToTop': 'TOP',
    'common.contactUs': 'Contact Workshop',
    'common.rights': 'All rights reserved.',
  },
  de: {
    // Navigation
    'nav.home': 'Startseite',
    'nav.products': 'Produkte',
    'nav.about': 'Über uns',
    'nav.privateLabel': 'Private Label',
    'nav.contact': 'Kontakt',
    'nav.rfq': 'Anfrageliste',
    'nav.language': 'Sprache',

    // Product Catalog
    'catalog.showing': 'Zeige',
    'catalog.of': 'von',
    'catalog.styles': 'Modellen',
    'catalog.allSilhouettes': 'Alle Modelle',
    'catalog.filterBy': 'Nach Kategorie filtern',
    'catalog.viewDetail': 'Spezifikationen & MOQ ansehen',
    'catalog.quickInquiry': 'Schnellanfrage',
    'catalog.leadTime': 'Musterzeit: 48 Std.',
    'catalog.moqPrefix': 'Mindestmenge',
    'catalog.sortFeatured': 'Empfohlene Modelle',
    'catalog.sortMoq': 'Mindestmenge: aufsteigend',
    'catalog.sortTitle': 'Titel: A bis Z',
    'catalog.loadingMore': 'Weitere Modelle laden...',
    'catalog.resetFilters': 'Filter zurücksetzen',
    'catalog.browseAll': 'Alle ansehen',
    'catalog.requestQuote': 'Angebot anfordern',

    // Product Detail Page (PDP)
    'pdp.addToQuote': 'Zur Anfrageliste hinzufügen',
    'pdp.buySampleAmazon': 'Muster bei Amazon bestellen',
    'pdp.downloadSpec': 'Technisches Datenblatt anfordern',
    'pdp.downloadSpecSheet': 'Technisches Datenblatt herunterladen (PDF)',
    'pdp.specs': 'Fertigungsspezifikationen',
    'pdp.wholesaleTiers': 'Großhandelsstaffelpreise',
    'pdp.unitPrice': 'Stückpreis',
    'pdp.prev': 'Zurück',
    'pdp.next': 'Weiter',
    'pdp.prevSilhouette': 'Vorheriges Modell',
    'pdp.nextSilhouette': 'Nächstes Modell',
    'pdp.colorway': 'Verfügbare Farbvarianten',
    'pdp.samplingNotice': 'Musterfertigung direkt ab Werk innerhalb von 48-72 Stunden möglich.',
    'pdp.needleGauge': 'Nadelstärke',
    'pdp.linking': 'Spitzenverarbeitung',
    'pdp.composition': 'Materialzusammensetzung',
    'pdp.sizing': 'Größenstandard',

    // RFQ Drawer
    'rfq.drawerTitle': 'B2B-Anfrage & Musterdossier',
    'rfq.emptyMessage': 'Ihre Anfrageliste ist leer. Wählen Sie Artikel aus dem Katalog.',
    'rfq.submitQuote': 'Offizielle Preisanfrage senden',
    'rfq.sampleRequest': 'Muster anfordern',
    'rfq.companyPlaceholder': 'Unternehmen / Markenname *',
    'rfq.buyerNamePlaceholder': 'Name des Einkäufers',
    'rfq.emailPlaceholder': 'Geschäftliche E-Mail-Adresse *',
    'rfq.phonePlaceholder': 'WhatsApp / Telefon',
    'rfq.destinationPlaceholder': 'Lieferland & Stadt (für Frachtkalkulation)',
    'rfq.requirementsPlaceholder': 'Anforderungen (eigenes Logo, Pantone-Farbe, Verpackung, Zielpreis)...',
    'rfq.clearAll': 'Alles leeren',
    'rfq.remove': 'Entfernen',

    // Section Hints
    'collections.swipeHint': 'Wischen, um alle Modelle zu entdecken',
    'collections.scrollHint': 'Horizontal scrollen oder Pfeile nutzen',
    'specs.swipeHint': 'Wischen für 5 technische Daten',
    'manufacturing.swipeHint': 'Wischen für Fertigungskapazitäten',

    // Stages
    'stage.overview': 'Überblick',
    'stage.specs': 'Spezifikation',
    'stage.collections': 'Modelle',
    'stage.infrastructure': 'Infrastruktur',
    'stage.sampleRequest': 'Musteranfrage',

    // General
    'common.backToTop': 'NACH OBEN',
    'common.contactUs': 'Werkstatt kontaktieren',
    'common.rights': 'Alle Rechte vorbehalten.',
  },
  fr: {
    // Navigation
    'nav.home': 'Accueil',
    'nav.products': 'Produits',
    'nav.about': 'À propos',
    'nav.privateLabel': 'Marque Blanche',
    'nav.contact': 'Contact',
    'nav.rfq': 'Panier de Devis',
    'nav.language': 'Langue',

    // Product Catalog
    'catalog.showing': 'Affichage de',
    'catalog.of': 'sur',
    'catalog.styles': 'modèles',
    'catalog.allSilhouettes': 'Tous les modèles',
    'catalog.filterBy': 'Filtrer par catégorie',
    'catalog.viewDetail': 'Voir les détails & MOQ',
    'catalog.quickInquiry': 'Demande rapide',
    'catalog.leadTime': 'Délai échantillon: 48h',
    'catalog.moqPrefix': 'Quantité min.',
    'catalog.sortFeatured': 'Modèles en vedette',
    'catalog.sortMoq': 'Quantité min.: croissant',
    'catalog.sortTitle': 'Titre: A à Z',
    'catalog.loadingMore': 'Chargement de modèles supplémentaires...',
    'catalog.resetFilters': 'Réinitialiser les filtres',
    'catalog.browseAll': 'Tout parcourir',
    'catalog.requestQuote': 'Demander un devis',

    // Product Detail Page (PDP)
    'pdp.addToQuote': 'Ajouter à la demande de devis',
    'pdp.buySampleAmazon': 'Acheter un échantillon sur Amazon',
    'pdp.downloadSpec': 'Demander la fiche technique',
    'pdp.downloadSpecSheet': 'Télécharger la fiche technique (PDF)',
    'pdp.specs': 'Spécifications de fabrication',
    'pdp.wholesaleTiers': 'Tarifs dégressifs de gros',
    'pdp.unitPrice': 'Prix unitaire',
    'pdp.prev': 'Précédent',
    'pdp.next': 'Suivant',
    'pdp.prevSilhouette': 'Silhouette précédente',
    'pdp.nextSilhouette': 'Silhouette suivante',
    'pdp.colorway': 'Coloris disponibles',
    'pdp.samplingNotice': 'Prototypage direct en usine disponible en 48-72h avec étiquettes personnalisées.',
    'pdp.needleGauge': 'Jauge d’aiguille',
    'pdp.linking': 'Rémaillage pointe',
    'pdp.composition': 'Composition',
    'pdp.sizing': 'Norme de taille',

    // RFQ Drawer
    'rfq.drawerTitle': 'Dossier de devis B2B & Échantillons',
    'rfq.emptyMessage': 'Votre panier de devis est vide. Sélectionnez des modèles dans le catalogue.',
    'rfq.submitQuote': 'Soumettre la demande de devis',
    'rfq.sampleRequest': 'Demander un échantillon',
    'rfq.companyPlaceholder': 'Entreprise / Nom de marque *',
    'rfq.buyerNamePlaceholder': 'Nom de l’acheteur',
    'rfq.emailPlaceholder': 'Adresse e-mail professionnelle *',
    'rfq.phonePlaceholder': 'WhatsApp / Téléphone',
    'rfq.destinationPlaceholder': 'Pays & Ville de livraison (pour devis transport)',
    'rfq.requirementsPlaceholder': 'Besoins de personnalisation (logo, couleur Pantone, emballage, prix cible)...',
    'rfq.clearAll': 'Tout effacer',
    'rfq.remove': 'Supprimer',

    // Section Hints
    'collections.swipeHint': 'Balayez pour découvrir tous les modèles',
    'collections.scrollHint': 'Faites défiler horizontalement ou utilisez les flèches',
    'specs.swipeHint': 'Balayez pour voir 5 spécifications',
    'manufacturing.swipeHint': 'Balayez pour voir les capacités',

    // Stages
    'stage.overview': 'Aperçu',
    'stage.specs': 'Spécifications',
    'stage.collections': 'Silhouettes',
    'stage.infrastructure': 'Infrastructure',
    'stage.sampleRequest': 'Demande d’échantillons',

    // General
    'common.backToTop': 'HAUT',
    'common.contactUs': 'Contacter l’atelier',
    'common.rights': 'Tous droits réservés.',
  },
  es: {
    // Navigation
    'nav.home': 'Inicio',
    'nav.products': 'Productos',
    'nav.about': 'Nosotros',
    'nav.privateLabel': 'Marca Blanca',
    'nav.contact': 'Contacto',
    'nav.rfq': 'Cesta de Cotización',
    'nav.language': 'Idioma',

    // Product Catalog
    'catalog.showing': 'Mostrando',
    'catalog.of': 'de',
    'catalog.styles': 'estilos',
    'catalog.allSilhouettes': 'Todos los estilos',
    'catalog.filterBy': 'Filtrar por categoría',
    'catalog.viewDetail': 'Ver detalles y pedido mín.',
    'catalog.quickInquiry': 'Consulta rápida',
    'catalog.leadTime': 'Plazo de muestra: 48h',
    'catalog.moqPrefix': 'Pedido mín.',
    'catalog.sortFeatured': 'Modelos destacados',
    'catalog.sortMoq': 'Pedido mín.: de menor a mayor',
    'catalog.sortTitle': 'Título: A a Z',
    'catalog.loadingMore': 'Cargando más estilos...',
    'catalog.resetFilters': 'Restablecer filtros',
    'catalog.browseAll': 'Explorar todo',
    'catalog.requestQuote': 'Solicitar cotización',

    // Product Detail Page (PDP)
    'pdp.addToQuote': 'Añadir a la cotización',
    'pdp.buySampleAmazon': 'Comprar muestra en Amazon',
    'pdp.downloadSpec': 'Solicitar ficha técnica / PDF',
    'pdp.downloadSpecSheet': 'Descargar ficha técnica (PDF)',
    'pdp.specs': 'Especificaciones de fabricación',
    'pdp.wholesaleTiers': 'Precios mayoristas por volumen',
    'pdp.unitPrice': 'Precio unitario',
    'pdp.prev': 'Anterior',
    'pdp.next': 'Siguiente',
    'pdp.prevSilhouette': 'Silueta anterior',
    'pdp.nextSilhouette': 'Silueta siguiente',
    'pdp.colorway': 'Colores disponibles',
    'pdp.samplingNotice': 'Muestras directas de fábrica listas en 48-72h con tarjetas de marca personalizadas.',
    'pdp.needleGauge': 'Grosor de aguja',
    'pdp.linking': 'Remallado de puntera',
    'pdp.composition': 'Composición',
    'pdp.sizing': 'Estándar de tallas',

    // RFQ Drawer
    'rfq.drawerTitle': 'Cotización B2B y Muestras',
    'rfq.emptyMessage': 'Su cesta está vacía. Seleccione modelos del catálogo.',
    'rfq.submitQuote': 'Enviar cotización formal',
    'rfq.sampleRequest': 'Solicitar muestra de tejido',
    'rfq.companyPlaceholder': 'Empresa / Nombre de marca *',
    'rfq.buyerNamePlaceholder': 'Nombre del comprador',
    'rfq.emailPlaceholder': 'Correo electrónico corporativo *',
    'rfq.phonePlaceholder': 'WhatsApp / Teléfono',
    'rfq.destinationPlaceholder': 'País y ciudad de entrega (para estimación de flete)',
    'rfq.requirementsPlaceholder': 'Requisitos de personalización (logotipo, color Pantone, embalaje, precio objetivo)...',
    'rfq.clearAll': 'Borrar todo',
    'rfq.remove': 'Eliminar',

    // Section Hints
    'collections.swipeHint': 'Desliza para ver todos los estilos',
    'collections.scrollHint': 'Desplázate horizontalmente o usa las flechas',
    'specs.swipeHint': 'Desliza para ver 5 especificaciones técnicas',
    'manufacturing.swipeHint': 'Desliza para ver las capacidades',

    // Stages
    'stage.overview': 'Descripción general',
    'stage.specs': 'Especificaciones',
    'stage.collections': 'Estilos',
    'stage.infrastructure': 'Infraestructura',
    'stage.sampleRequest': 'Solicitud de muestra',

    // General
    'common.backToTop': 'ARRIBA',
    'common.contactUs': 'Contactar taller',
    'common.rights': 'Todos los derechos reservados.',
  },
};
