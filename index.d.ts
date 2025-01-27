type AttentionInputType = 'attention';

type PrimaryInputTypes =
  | 'addition'
  | 'archipelago'
  | 'city'
  | 'continent'
  | 'country'
  | 'countryCode'
  | 'county'
  | 'door'
  | 'floor'
  | 'hamlet'
  | 'house'
  | 'houseNumber'
  | 'infos'
  | 'island'
  | 'municipality'
  | 'neighbourhood'
  | 'postalCity'
  | 'postcode'
  | 'region'
  | 'road'
  | 'state'
  | 'stateDistrict'
  | 'village';

type AliasInputTypes =
  | 'addition'
  | 'allotments'
  | 'borough'
  | 'building'
  | 'cityBlock'
  | 'cityDistrict'
  | 'commercial'
  | 'countryName'
  | 'county'
  | 'countyCode'
  | 'croft'
  | 'department'
  | 'district'
  | 'door'
  | 'farmland'
  | 'floor'
  | 'footway'
  | 'housenumber'
  | 'houses'
  | 'industrial'
  | 'infos'
  | 'isolatedDwelling'
  | 'localAdministrativeArea'
  | 'locality'
  | 'partialPostcode'
  | 'path'
  | 'pedestrian'
  | 'place'
  | 'postcode'
  | 'province'
  | 'publicBuilding'
  | 'quarter'
  | 'residential'
  | 'roadReference'
  | 'roadReferenceIntl'
  | 'square'
  | 'state'
  | 'stateCode'
  | 'street'
  | 'streetName'
  | 'streetNumber'
  | 'subcounty'
  | 'subdistrict'
  | 'subdivision'
  | 'suburb'
  | 'town'
  | 'township'
  | 'ward';

type Input = Partial<Record<AttentionInputType | PrimaryInputTypes | AliasInputTypes, string>>;

interface CommonOptions {
  abbreviate?: boolean;
  appendCountry?: boolean;
  cleanupPostcode?: boolean;
  countryCode?: string;
  fallbackCountryCode?: string;
}

export function format(
  input: Input,
  options?: CommonOptions & {output?: 'string'},
): string;

export function format(
  input: Input,
  options: CommonOptions & {output: 'array'},
): string[];
