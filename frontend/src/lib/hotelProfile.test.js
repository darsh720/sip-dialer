import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPARTMENT_LIST, defaultHotelProfile, normalizeHotelProfile } from './hotelProfile.js';

test('normalizeHotelProfile fills missing values and keeps room types as arrays', () => {
  const result = normalizeHotelProfile({
    hotelName: 'Sunrise Suites',
    propertyAddress: '24 Lake View Road',
    propertyPhoneNumber: '+1 555 123 4567',
    roomTypes: 'Deluxe, Family Suite',
    breakfast: 'Yes',
    lunch: 'No',
    dinner: 'Yes'
  });

  assert.equal(result.hotelName, 'Sunrise Suites');
  assert.equal(result.propertyAddress, '24 Lake View Road');
  assert.equal(result.propertyPhoneNumber, '+1 555 123 4567');
  assert.deepEqual(result.roomTypes, ['Deluxe', 'Family Suite']);
  assert.equal(result.breakfast, 'Yes');
  assert.equal(result.lunch, 'No');
  assert.equal(result.dinner, 'Yes');
  assert.equal(result.smokingRoom, defaultHotelProfile.smokingRoom);
  assert.equal(result.guestWifiPassword, defaultHotelProfile.guestWifiPassword);
});

test('DEPARTMENT_LIST has 14 departments and normalizeHotelProfile retains extensions', () => {
  assert.equal(DEPARTMENT_LIST.length, 14);
  const expectedKeys = [
    'frontDesk', 'ringGroup', 'sales', 'gm', 'laundry', 'lobby', 'fitness',
    'pool', 'elevator', 'meetingRoom', 'maintenanceRoom', 'office', 'agm', 'businessCenter'
  ];
  assert.deepEqual(DEPARTMENT_LIST.map(([k]) => k), expectedKeys);

  const normalized = normalizeHotelProfile({
    departmentExtensions: {
      frontDesk: '101',
      ringGroup: '102',
      sales: '103',
      gm: '104',
      businessCenter: '114'
    }
  });

  assert.equal(normalized.departmentExtensions.frontDesk, '101');
  assert.equal(normalized.departmentExtensions.ringGroup, '102');
  assert.equal(normalized.departmentExtensions.sales, '103');
  assert.equal(normalized.departmentExtensions.gm, '104');
  assert.equal(normalized.departmentExtensions.businessCenter, '114');
  assert.equal(normalized.departmentExtensions.laundry, '');
});

