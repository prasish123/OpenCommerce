import { XMLParser } from 'fast-xml-parser';
import { log } from '../../shared/logger';
import { PromotionType } from '../../shared/types';

/**
 * NAXML Parser for Elistar file imports
 * Handles all 5 file types from Elistar:
 * 1. ItemMaintenance (products)
 * 2. MerchandiseCodeMaintenance (departments)
 * 3. MixMatchMaintenance (mix & match promos)
 * 4. ComboMaintenance (combo deals)
 * 5. ItemListMaintenance (item groups)
 */

// ===========================
// NAXML Types (from XML)
// ===========================

interface NAXMLMaintenance {
  'NAXML-MaintenanceRequest': {
    TransmissionHeader: {
      StoreLocationID: string;
      VendorName: string;
    };
    ItemMaintenance?: {
      ITTDetail: NAXMLItem | NAXMLItem[];
    };
    MerchandiseCodeMaintenance?: {
      MCTDetail: NAXMLMerchandiseCode | NAXMLMerchandiseCode[];
    };
    MixMatchMaintenance?: {
      MMTDetail: NAXMLMixMatch | NAXMLMixMatch[];
    };
    ComboMaintenance?: {
      CBTDetail: NAXMLCombo | NAXMLCombo[];
    };
    ItemListMaintenance?: {
      ILTDetail: NAXMLItemList | NAXMLItemList[];
    };
  };
}

interface NAXMLItem {
  RecordAction?: { '@_type': string };
  ItemCode: {
    POSCodeFormat: { '@_format': string };
    POSCode: string;
    POSCodeModifier: string;
  };
  ITTData: {
    ActiveFlag: { '@_value': string };
    InventoryValuePrice?: string;
    MerchandiseCode: string;
    RegularSellPrice: string;
    Description: string;
    PaymentSystemsProductCode?: string;
    SellingUnits?: string;
    TaxStrategyID?: string;
    Promotion?: {
      PromotionID: string;
      PromotionAmount?: string;
    };
  };
}

interface NAXMLMerchandiseCode {
  RecordAction?: { '@_type': string };
  MerchandiseCode: string;
  ActiveFlag: { '@_value': string };
  MerchandiseCodeDescription: string;
  PaymentSystemsProductCode?: string;
  TaxStrategyID?: string;
  SalesRestriction?: {
    MinimumCustomerAge: string;
  };
}

interface NAXMLMixMatch {
  RecordAction?: { '@_type': string };
  Promotion: {
    PromotionID: string;
    PromotionReason?: string;
  };
  MixMatchDescription: string;
  ItemListID: string;
  StartDate: string;
  StopDate: string;
  StartTime?: string;
  StopTime?: string;
  WeekdayAvailability?: any[];
  MixMatchEntry: {
    MixMatchUnits: string;
    MixMatchPrice?: string;
    MixMatchDiscountAmount?: string;
  };
}

interface NAXMLCombo {
  RecordAction?: { '@_type': string };
  Promotion: {
    PromotionID: string;
    PromotionReason?: string;
  };
  LinkCode?: { '@_type': string };
  ComboDescription: string;
  ComboPrice?: string;
  ComboList: {
    ComboItemList: NAXMLComboItem | NAXMLComboItem[];
  };
  StartDate: string;
  StopDate: string;
  StartTime?: string;
  StopTime?: string;
  WeekdayAvailability?: any[];
}

interface NAXMLComboItem {
  ItemListID: string;
  ComboItemQuantity: string;
  ComboItemUnitPrice?: string;
  ComboItemDiscountAllocation?: {
    '@_type': string;
    '#text': string;
  };
}

interface NAXMLItemList {
  RecordAction?: { '@_type': string };
  ItemListID: string;
  ItemListDescription: string;
  ItemListEntry?: {
    ItemCode: {
      POSCodeFormat: { '@_format': string };
      POSCode: string;
      POSCodeModifier: string;
    };
  } | Array<{
    ItemCode: {
      POSCodeFormat: { '@_format': string };
      POSCode: string;
      POSCodeModifier: string;
    };
  }>;
}

// ===========================
// Parsed Output Types
// ===========================

export interface ParsedItem {
  barcode: string;
  barcodeType: string;
  description: string;
  basePrice: number;
  inventoryValuePrice?: number;
  merchandiseCode: string;
  taxStrategyId: number;
  active: boolean;
  action: 'add' | 'delete';
}

export interface ParsedMerchandiseCode {
  code: string;
  description: string;
  active: boolean;
  taxStrategyId: number;
  minimumCustomerAge?: number;
  action: 'add' | 'delete';
}

export interface ParsedPromotion {
  id: string;
  type: PromotionType;
  description: string;
  startDate: Date;
  endDate: Date;
  rules: any;
  action: 'add' | 'delete';
}

export interface ParsedItemList {
  id: string;
  description: string;
  barcodes: string[];
  action: 'add' | 'delete';
}

export interface NAXMLParseResult {
  storeId: string;
  items: ParsedItem[];
  merchandiseCodes: ParsedMerchandiseCode[];
  promotions: ParsedPromotion[];
  itemLists: ParsedItemList[];
  errors: string[];
}

// ===========================
// Parser Class
// ===========================

export class NAXMLParser {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: true,
      trimValues: true,
    });
  }

  /**
   * Parse NAXML file (all types)
   */
  parse(xmlContent: string): NAXMLParseResult {
    const result: NAXMLParseResult = {
      storeId: '',
      items: [],
      merchandiseCodes: [],
      promotions: [],
      itemLists: [],
      errors: [],
    };

    try {
      const parsed: NAXMLMaintenance = this.parser.parse(xmlContent);
      const request = parsed['NAXML-MaintenanceRequest'];

      if (!request) {
        throw new Error('Invalid NAXML format: Missing NAXML-MaintenanceRequest');
      }

      // Extract store ID
      result.storeId = request.TransmissionHeader?.StoreLocationID || '';

      // Parse ItemMaintenance
      if (request.ItemMaintenance) {
        result.items = this.parseItems(request.ItemMaintenance.ITTDetail);
      }

      // Parse MerchandiseCodeMaintenance
      if (request.MerchandiseCodeMaintenance) {
        result.merchandiseCodes = this.parseMerchandiseCodes(
          request.MerchandiseCodeMaintenance.MCTDetail
        );
      }

      // Parse MixMatchMaintenance
      if (request.MixMatchMaintenance) {
        const mixMatchPromos = this.parseMixMatch(
          request.MixMatchMaintenance.MMTDetail
        );
        result.promotions.push(...mixMatchPromos);
      }

      // Parse ComboMaintenance
      if (request.ComboMaintenance) {
        const comboPromos = this.parseCombos(request.ComboMaintenance.CBTDetail);
        result.promotions.push(...comboPromos);
      }

      // Parse ItemListMaintenance
      if (request.ItemListMaintenance) {
        result.itemLists = this.parseItemLists(
          request.ItemListMaintenance.ILTDetail
        );
      }

      log.info('NAXML parsed successfully', {
        storeId: result.storeId,
        items: result.items.length,
        merchandiseCodes: result.merchandiseCodes.length,
        promotions: result.promotions.length,
        itemLists: result.itemLists.length,
        errors: result.errors.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Parse failed: ${message}`);
      log.error('NAXML parse error', error);
    }

    return result;
  }

  /**
   * Parse Items (products)
   */
  private parseItems(details: NAXMLItem | NAXMLItem[]): ParsedItem[] {
    const items: ParsedItem[] = [];
    const detailsArray = Array.isArray(details) ? details : [details];

    for (const detail of detailsArray) {
      try {
        const action = detail.RecordAction?.['@_type'] === 'delete' ? 'delete' : 'add';

        // Skip if no ITTData (happens with delete records sometimes)
        if (!detail.ITTData) continue;

        const item: ParsedItem = {
          barcode: detail.ItemCode.POSCode,
          barcodeType: detail.ItemCode.POSCodeFormat['@_format'] || 'UPC-A',
          description: detail.ITTData.Description,
          basePrice: parseFloat(detail.ITTData.RegularSellPrice),
          inventoryValuePrice: detail.ITTData.InventoryValuePrice
            ? parseFloat(detail.ITTData.InventoryValuePrice)
            : undefined,
          merchandiseCode: detail.ITTData.MerchandiseCode,
          taxStrategyId: parseInt(detail.ITTData.TaxStrategyID || '1'),
          active: detail.ITTData.ActiveFlag['@_value'] === 'yes',
          action,
        };

        items.push(item);
      } catch (error) {
        log.warn('Failed to parse item', { error, detail });
      }
    }

    return items;
  }

  /**
   * Parse Merchandise Codes (departments)
   */
  private parseMerchandiseCodes(
    details: NAXMLMerchandiseCode | NAXMLMerchandiseCode[]
  ): ParsedMerchandiseCode[] {
    const codes: ParsedMerchandiseCode[] = [];
    const detailsArray = Array.isArray(details) ? details : [details];

    for (const detail of detailsArray) {
      try {
        const action = detail.RecordAction?.['@_type'] === 'delete' ? 'delete' : 'add';

        const code: ParsedMerchandiseCode = {
          code: detail.MerchandiseCode,
          description: detail.MerchandiseCodeDescription,
          active: detail.ActiveFlag['@_value'] === 'yes',
          taxStrategyId: parseInt(detail.TaxStrategyID || '0'),
          minimumCustomerAge: detail.SalesRestriction?.MinimumCustomerAge
            ? parseInt(detail.SalesRestriction.MinimumCustomerAge)
            : undefined,
          action,
        };

        codes.push(code);
      } catch (error) {
        log.warn('Failed to parse merchandise code', { error, detail });
      }
    }

    return codes;
  }

  /**
   * Parse Mix & Match promotions
   */
  private parseMixMatch(
    details: NAXMLMixMatch | NAXMLMixMatch[]
  ): ParsedPromotion[] {
    const promos: ParsedPromotion[] = [];
    const detailsArray = Array.isArray(details) ? details : [details];

    for (const detail of detailsArray) {
      try {
        const action = detail.RecordAction?.['@_type'] === 'delete' ? 'delete' : 'add';

        const promo: ParsedPromotion = {
          id: detail.Promotion.PromotionID,
          type: PromotionType.MIX_MATCH,
          description: detail.MixMatchDescription,
          startDate: new Date(detail.StartDate),
          endDate: new Date(detail.StopDate),
          rules: {
            itemListId: detail.ItemListID,
            requiredQuantity: parseInt(detail.MixMatchEntry.MixMatchUnits),
            mixMatchPrice: detail.MixMatchEntry.MixMatchPrice
              ? parseFloat(detail.MixMatchEntry.MixMatchPrice)
              : undefined,
            mixMatchDiscountAmount: detail.MixMatchEntry.MixMatchDiscountAmount
              ? parseFloat(detail.MixMatchEntry.MixMatchDiscountAmount)
              : undefined,
          },
          action,
        };

        promos.push(promo);
      } catch (error) {
        log.warn('Failed to parse mix & match promo', { error, detail });
      }
    }

    return promos;
  }

  /**
   * Parse Combo promotions
   */
  private parseCombos(details: NAXMLCombo | NAXMLCombo[]): ParsedPromotion[] {
    const promos: ParsedPromotion[] = [];
    const detailsArray = Array.isArray(details) ? details : [details];

    for (const detail of detailsArray) {
      try {
        const action = detail.RecordAction?.['@_type'] === 'delete' ? 'delete' : 'add';

        // Parse combo items
        const comboItems = Array.isArray(detail.ComboList.ComboItemList)
          ? detail.ComboList.ComboItemList
          : [detail.ComboList.ComboItemList];

        const combos = comboItems.map((item) => ({
          itemListId: item.ItemListID,
          quantity: parseInt(item.ComboItemQuantity),
          unitPrice: item.ComboItemUnitPrice
            ? parseFloat(item.ComboItemUnitPrice)
            : undefined,
          discountAmount: item.ComboItemDiscountAllocation
            ? parseFloat(
                typeof item.ComboItemDiscountAllocation === 'string'
                  ? item.ComboItemDiscountAllocation
                  : item.ComboItemDiscountAllocation['#text']
              )
            : undefined,
        }));

        const promo: ParsedPromotion = {
          id: detail.Promotion.PromotionID,
          type: PromotionType.COMBO,
          description: detail.ComboDescription,
          startDate: new Date(detail.StartDate),
          endDate: new Date(detail.StopDate),
          rules: {
            combos,
            comboPrice: detail.ComboPrice
              ? parseFloat(detail.ComboPrice)
              : undefined,
          },
          action,
        };

        promos.push(promo);
      } catch (error) {
        log.warn('Failed to parse combo promo', { error, detail });
      }
    }

    return promos;
  }

  /**
   * Parse Item Lists (item groups for promos)
   */
  private parseItemLists(
    details: NAXMLItemList | NAXMLItemList[]
  ): ParsedItemList[] {
    const lists: ParsedItemList[] = [];
    const detailsArray = Array.isArray(details) ? details : [details];

    for (const detail of detailsArray) {
      try {
        const action = detail.RecordAction?.['@_type'] === 'delete' ? 'delete' : 'add';

        // Extract barcodes from entries
        const barcodes: string[] = [];
        if (detail.ItemListEntry) {
          const entries = Array.isArray(detail.ItemListEntry)
            ? detail.ItemListEntry
            : [detail.ItemListEntry];

          for (const entry of entries) {
            if (entry.ItemCode?.POSCode) {
              barcodes.push(entry.ItemCode.POSCode);
            }
          }
        }

        const list: ParsedItemList = {
          id: detail.ItemListID,
          description: detail.ItemListDescription,
          barcodes,
          action,
        };

        lists.push(list);
      } catch (error) {
        log.warn('Failed to parse item list', { error, detail });
      }
    }

    return lists;
  }
}
