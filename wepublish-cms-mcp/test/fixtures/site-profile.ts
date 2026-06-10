import type { GetSiteProfileQuery } from '../../src/generated/graphql.js';

export const fullSiteProfile: GetSiteProfileQuery = {
  peerProfile: {
    name: 'Tsüri',
    websiteURL: 'https://tsri.ch',
    hostURL: 'https://api.tsri.ch',
    themeColor: '#ff0000',
    themeFontColor: '#ffffff',
    logoID: 'img_logo_1',
    squareLogoId: 'img_square_1',
    callToActionURL: 'https://tsri.ch/join',
    callToActionImageID: 'img_cta_1',
  },
};

export const incompleteSiteProfile: GetSiteProfileQuery = {
  peerProfile: {
    name: 'Hauptstadt',
    websiteURL: 'https://hauptstadt.be',
    hostURL: 'https://api.hauptstadt.be',
    themeColor: '#003366',
    themeFontColor: '#ffffff',
    logoID: null, // no logo
    squareLogoId: null,
    callToActionURL: '',
    callToActionImageID: null,
  },
};
