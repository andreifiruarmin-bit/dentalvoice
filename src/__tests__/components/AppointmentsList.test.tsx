import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AppointmentsList from '../../components/AppointmentsList';

// Mock data
const mockAppointments = [
  {
    id: '1',
    date: '2026-04-15',
    time: '10:00',
    service: 'Consultație',
    firstName: 'John',
    lastName: 'Doe',
    phone: '0712345678',
    status: 'confirmed',
    channel: 'web',
    doctorId: '1',
    doctorName: 'Dr. Smith'
  },
  {
    id: '2',
    date: '2026-04-15',
    time: '11:00',
    service: 'igienizare',
    firstName: 'Jane',
    lastName: 'Smith',
    phone: '0723456789',
    status: 'pending',
    channel: 'whatsapp',
    doctorId: '2',
    doctorName: 'Dr. Johnson'
  }
];

describe('AppointmentsList', () => {
  const defaultProps = {
    appointments: mockAppointments,
    searchTerm: '',
    setSearchTerm: jest.fn(),
    appointmentFilter: 'all',
    setAppointmentFilter: jest.fn(),
    dateFilter: 'all',
    setDateFilter: jest.fn(),
    currentPage: 1,
    setCurrentPage: jest.fn(),
    onAppointmentClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders appointments list correctly', () => {
    render(<AppointmentsList {...defaultProps} />);
    
    expect(screen.getByText('2 programări găsite')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Consultație')).toBeInTheDocument();
    expect(screen.getByText('Igienizare')).toBeInTheDocument();
  });

  it('filters appointments by search term', async () => {
    const mockSetSearchTerm = jest.fn();
    render(<AppointmentsList {...defaultProps} setSearchTerm={mockSetSearchTerm} />);
    
    const searchInput = screen.getByPlaceholderText('Caută programări...');
    await userEvent.type(searchInput, 'John');
    
    await waitFor(() => {
      expect(mockSetSearchTerm).toHaveBeenCalledWith('John');
    });
  });

  it('filters appointments by status', async () => {
    const mockSetFilter = jest.fn();
    render(<AppointmentsList {...defaultProps} appointmentFilter="confirmed" setAppointmentFilter={mockSetFilter} />);
    
    const statusFilter = screen.getByDisplayValue('Confirmate');
    expect(statusFilter).toBeInTheDocument();
  });

  it('filters appointments by date', async () => {
    const mockSetDateFilter = jest.fn();
    render(<AppointmentsList {...defaultProps} dateFilter="today" setDateFilter={mockSetDateFilter} />);
    
    const dateFilter = screen.getByDisplayValue('Azi');
    expect(dateFilter).toBeInTheDocument();
  });

  it('handles appointment click', async () => {
    const mockOnAppointmentClick = jest.fn();
    render(<AppointmentsList {...defaultProps} onAppointmentClick={mockOnAppointmentClick} />);
    
    const appointmentCard = screen.getByText('John Doe').closest('[role="button"]');
    await userEvent.click(appointmentCard!);
    
    await waitFor(() => {
      expect(mockOnAppointmentClick).toHaveBeenCalledWith(mockAppointments[0]);
    });
  });

  it('shows pagination when there are many appointments', () => {
    const manyAppointments = Array.from({ length: 25 }, (_, i) => ({
      ...mockAppointments[0],
      id: `${i + 1}`,
      firstName: `User${i + 1}`,
      lastName: 'Test',
    }));
    
    render(<AppointmentsList {...defaultProps} appointments={manyAppointments} />);
    
    expect(screen.getByText('Arată 1-20 din 25 programări')).toBeInTheDocument();
    expect(screen.getByText('Următor')).toBeInTheDocument();
  });

  it('shows empty state when no appointments match filters', () => {
    render(<AppointmentsList {...defaultProps} appointments={[]} />);
    
    expect(screen.getByText('0 programare găsită')).toBeInTheDocument();
    expect(screen.getByText('Nu există date care să corespundă criteriilor de căutare.')).toBeInTheDocument();
  });
});
