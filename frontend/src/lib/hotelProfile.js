export const DEPARTMENT_LIST = [
  ['frontDesk', 'Front Desk'],
  ['ringGroup', 'Ring Group'],
  ['sales', 'Sales'],
  ['gm', 'GM'],
  ['laundry', 'Laundry'],
  ['lobby', 'Lobby'],
  ['fitness', 'Fitness'],
  ['pool', 'Pool'],
  ['elevator', 'Elevator'],
  ['meetingRoom', 'Meeting Room'],
  ['maintenanceRoom', 'Maintenance Room'],
  ['office', 'Office'],
  ['agm', 'AGM'],
  ['businessCenter', 'Business Center'],
];

export const defaultHotelProfile = {
  id: '',
  hotel: '',
  propertyNo: '',
  ownerName: '',
  address: '',
  propertyName: '',
  propertyAddress: '',
  propertyPhoneNumber: '',
  propertyFaxNumber: '',
  propertyCheckInTime: '',
  propertyCheckOutTime: '',
  lateCheckoutPolicy: '',
  cancellationPolicy: '',
  roomTypes: [],
  smokingRoom: 'No',
  petPolicy: 'No',
  parkingPolicy: 'No',
  parkingFee: '',
  nearbyLocation: '',
  breakfast: 'No',
  lunch: 'No',
  dinner: 'No',
  breakfastTime: '',
  lunchTime: '',
  dinnerTime: '',
  bookingAmount: 'No',
  bookingAmountValue: '',
  roomType: 'AC',
  hotelAmenities: [],
  fitness: 'No',
  fitnessHours: '',
  pool: 'No',
  poolHours: '',
  guestWifiPassword: '',
  housekeepingHours: '',
  departmentExtensions: {
    frontDesk: '',
    ringGroup: '',
    sales: '',
    gm: '',
    laundry: '',
    lobby: '',
    fitness: '',
    pool: '',
    elevator: '',
    meetingRoom: '',
    maintenanceRoom: '',
    office: '',
    agm: '',
    businessCenter: '',
  },
};

export const normalizeHotelProfile = (input = {}) => {
  const raw = { ...defaultHotelProfile, ...input };
  const departmentExtensions = {
    ...defaultHotelProfile.departmentExtensions,
    ...(input.departmentExtensions || {}),
  };

  const splitLabels = (value) => {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  };

  return {
    ...raw,
    propertyName: raw.propertyName || raw.hotel || '',
    propertyAddress: raw.propertyAddress || raw.address || '',
    propertyPhoneNumber: raw.propertyPhoneNumber || '',
    propertyFaxNumber: raw.propertyFaxNumber || '',
    propertyCheckInTime: raw.propertyCheckInTime || '',
    propertyCheckOutTime: raw.propertyCheckOutTime || '',
    lateCheckoutPolicy: raw.lateCheckoutPolicy || '',
    cancellationPolicy: raw.cancellationPolicy || '',
    roomTypes: splitLabels(raw.roomTypes),
    smokingRoom: raw.smokingRoom || 'No',
    petPolicy: raw.petPolicy || 'No',
    parkingPolicy: raw.parkingPolicy || 'No',
    parkingFee: raw.parkingFee || '',
    nearbyLocation: raw.nearbyLocation || '',
    breakfast: raw.breakfast || 'No',
    lunch: raw.lunch || 'No',
    dinner: raw.dinner || 'No',
    breakfastTime: raw.breakfastTime || '',
    lunchTime: raw.lunchTime || '',
    dinnerTime: raw.dinnerTime || '',
    bookingAmount: raw.bookingAmount || 'No',
    bookingAmountValue: raw.bookingAmountValue || '',
    roomType: raw.roomType || 'AC',
    hotelAmenities: splitLabels(raw.hotelAmenities),
    fitness: raw.fitness || 'No',
    fitnessHours: raw.fitnessHours || '',
    pool: raw.pool || 'No',
    poolHours: raw.poolHours || '',
    guestWifiPassword: raw.guestWifiPassword || '',
    housekeepingHours: raw.housekeepingHours || '',
    departmentExtensions,
  };
};
