import type {
  CheckPeeringStatusQuery,
  CheckNavDomainBrandingQuery,
} from '../../src/generated/graphql.js';

// --- peering ---
export const peersConfigured: CheckPeeringStatusQuery = {
  peers: [
    {
      id: 'p1',
      name: 'Tsüri',
      slug: 'tsri',
      hostURL: 'https://api.tsri.ch',
      isDisabled: false,
    },
    {
      id: 'p2',
      name: 'Old Peer',
      slug: 'old',
      hostURL: 'https://api.old.ch',
      isDisabled: true,
    },
  ],
};

export const peersNone: CheckPeeringStatusQuery = { peers: [] };

// --- navigation / domain / branding ---
const link = {
  __typename: 'ExternalNavigationLink',
} as CheckNavDomainBrandingQuery['navigations'][number]['links'][number];

export const navComplete: CheckNavDomainBrandingQuery = {
  navigations: [
    { key: 'main', name: 'Main', links: [link] },
    { key: 'header', name: 'Header', links: [link] },
    { key: 'footer', name: 'Footer', links: [link] },
    { key: 'icons', name: 'Icons', links: [link] },
  ],
  peerProfile: {
    name: 'Tsüri',
    websiteURL: 'https://tsri.ch',
    hostURL: 'https://api.tsri.ch',
    themeColor: '#ff0000',
    logoID: 'img_logo_1',
  },
};

export const navIncomplete: CheckNavDomainBrandingQuery = {
  navigations: [
    { key: 'main', name: 'Main', links: [link] },
    { key: 'footer', name: 'Footer', links: [] }, // present but empty
  ],
  peerProfile: {
    name: 'Hauptstadt',
    websiteURL: '',
    hostURL: 'https://api.hauptstadt.be',
    themeColor: '#003366',
    logoID: null,
  },
};
