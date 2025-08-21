# 🚂 sparpreis.guru

**Find the cheapest train tickets with advanced filtering and real-time streaming**

sparpreis.guru is a Next.js application that provides the most comprehensive train price search for Deutsche Bahn. With advanced features like flexible date selection, time filtering, real-time streaming results, and intelligent caching, it's the ultimate tool for finding the best train deals.

## ✨ Features

### 🔍 **Smart Search Options**
- **Flexible Date Selection**: Choose any date range or specific weekdays up to 30 days
- **Time Filtering**: Search by departure time ("Abfahrt ab") and arrival time ("Ankunft bis") 
- **Night Train Support**: Special handling for overnight connections with proper time filtering
- **Weekday Selection**: Choose specific weekdays (Mo-So) for recurring travel patterns

### ⚡ **Real-Time Streaming Results**
- **Live Updates**: See results as they come in with real-time streaming
- **Grace Period**: 4-second buffer to catch delayed backend results
- **Progress Tracking**: Visual progress bar with estimated time remaining
- **Smart Cancellation**: Cancel searches anytime with proper cleanup

### 🎯 **Advanced Booking Integration**
- **Direct Booking Links**: One-click booking to Deutsche Bahn with all search parameters
- **Pre-filled Details**: Age, discount cards, class, and connection preferences automatically applied
- **Multiple Connection Options**: View all available trains per day with detailed timing
- **Best Price Highlighting**: Clear marking of cheapest options per time window

### � **Performance & Reliability**
- **Intelligent Caching**: Fast repeat searches with smart cache invalidation
- **Rate Limiting**: Global rate limiter with Round-Robin session management
- **Multi-Session Support**: Handle multiple concurrent users efficiently
- **Error Recovery**: Robust error handling with automatic retries

### � **Rich Data Visualization**
- **Interactive Calendar**: Month view with price comparison and visual indicators
- **Price Analytics**: Min, max, and average prices across searched period
- **Connection Details**: Transfer count, duration, and route information
- **Mobile Optimized**: Responsive design for all screen sizes

## 🚀 Quick Start

### Prerequisites

- Node.js
- pnpm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/XLixl4snSU/sparpreis.guru.git
   cd sparpreis.guru
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Run the development server**
   ```bash
   pnpm run dev
   ```

4. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🎯 Usage

### Basic Search

1. **Enter Stations**: Type start and destination stations (e.g., "München", "Berlin")
2. **Select Date Range**: Choose your travel period using "Reisezeitraum ab/bis"
3. **Choose Weekdays**: Select specific weekdays or keep all selected
4. **Configure Passenger**: Set age, discount cards, and class preferences
5. **Search**: Click "Bestpreise suchen" to start real-time search
6. **View Results**: Interactive calendar shows prices and progress
7. **Book**: Click on any day to see all connections and book directly

### Advanced Options

#### Time Filtering
- **Departure Time**: Set earliest departure time (e.g., "08:00")
- **Arrival Time**: Set latest arrival time (e.g., "18:00") 
- **Night Trains**: Automatic handling of overnight connections

#### Travel Preferences  
- **Class Selection**: Choose between 1st and 2nd class
- **BahnCard Discounts**: Apply BahnCard 25/50 discounts automatically
- **Fast Connections**: Prioritize speed over price
- **Direct Connections**: Search only direct trains (0 transfers)
- **Deutschland-Ticket**: Search only Deutschland-Ticket compatible routes
- **Max Transfers**: Limit connections (0-5 transfers)

#### Smart Date Selection
- **Flexible Weekdays**: Select Mo-So for recurring travel patterns
- **Date Range**: Search up to 30 days with automatic optimization
- **Custom Periods**: Perfect for business trips, vacations, or commuting

## 🛠️ Technical Details

### Architecture

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **API**: Deutsche Bahn REST API integration
- **Deployment**: Vercel-ready - enter a valid NEXT_PUBLIC_BASE_URL as an Environment Variable

### Key Components

```
├── app/
│   ├── api/search-prices/     # Main price search API with streaming
│   ├── api/search-progress/   # Real-time progress tracking
│   ├── api/search-prices/cancel-search/ # Search cancellation
│   └── page.tsx               # Main application page
├── components/
│   ├── train-search-form.tsx  # Advanced search form
│   ├── train-results.tsx      # Streaming results handler
│   ├── price-calendar.tsx     # Interactive calendar view
│   ├── day-details-modal.tsx  # Connection details modal
│   └── ui/                    # shadcn/ui components
└── lib/
    └── utils/                 # Helper functions
```

### API Integration

The application integrates with Deutsche Bahn's internal APIs:

- **Station Search**: `https://www.bahn.de/web/api/reiseloesung/orte`
- **Price Search**: `https://www.bahn.de/web/api/angebote/tagesbestpreis`

## 🔧 Configuration

### Environment Variables

No environment variables are required for local deployment. The app works out of the box.

For production deployment on Vercel, set:
- **NEXT_PUBLIC_BASE_URL**: Your deployed domain URL (e.g., "https://sparpreis.guru")

### Customization

- **Day Limits**: Modify the max day limit in `components/train-search-form.tsx`
- **Styling**: Customize colors and themes in `tailwind.config.ts`
- **API Timeouts**: Adjust delays in `app/api/search-prices/rate-limiter.ts`

## 📊 Performance

### Search Times

- **1 day**: ~2-3 seconds
- **7 days**: ~14-21 seconds  
- **30 days**: ~60-90 seconds

### Advanced Features

- **Real-time Streaming**: Results appear as they're found
- **Grace Period**: 4-second buffer to catch delayed results
- **Intelligent Caching**: Repeat searches are instant
- **Multi-user Support**: Round-robin queue system handles concurrent users
- **Session Management**: Smart cancellation and cleanup

### Rate Limiting

The application includes sophisticated rate limiting with:
- **Base Interval**: 1.2 seconds between requests
- **Burst Handling**: Up to 15 requests in 20 seconds
- **Sustained Limits**: Max 40 requests in 60 seconds
- **Auto-scaling**: Intervals adjust based on API response times

## 🐛 Debugging

### Debug Mode

Access the debug page at `/debug` to:
- Test API connectivity
- Validate station searches
- Inspect request/response data
- Troubleshoot 422 errors

### Common Issues

1. **Station Not Found**: Try major city names like "München", "Berlin", "Hamburg"
2. **422 Errors**: Use the debug page to inspect API requests
3. **No Prices Found**: Try different dates or reduce transfer limits

## 🚀 Deployment

### Vercel (Recommended)

1. **Connect Repository**: Import your GitHub repository to Vercel
2. **Deploy**: Vercel will automatically detect Next.js and deploy
3. **Custom Domain**: Configure your custom domain in Vercel settings

### Other Platforms

The application works on any platform supporting Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- Self-hosted with Docker

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test thoroughly
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow the existing component structure
- Add proper error handling
- Include JSDoc comments for complex functions

## 📝 License

This project is licensed under the GNU General Public License v3.0 License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Deutsche Bahn**: For providing the underlying train data
- **shadcn/ui**: For the beautiful UI components
- **Next.js Team**: For the excellent framework
- **Original PHP Version**: This project was converted from a PHP implementation of [hackgrid](https://github.com/hackgrid/)

---

**Vibed with Github Copilot for German train travelers**