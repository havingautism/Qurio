import styled from 'styled-components'

const DotLoader = ({ size = '6px', color, gap = '4px', className }) => {
  return (
    <StyledWrapper $size={size} $color={color} $gap={gap} className={className}>
      <div className="dot" />
      <div className="dot" />
      <div className="dot" />
    </StyledWrapper>
  )
}

const StyledWrapper = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.$gap};
  padding: 4px;

  .dot {
    width: ${props => props.$size};
    height: ${props => props.$size};
    background-color: ${props => props.$color || 'currentColor'};
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .dot:nth-child(1) {
    animation-delay: -0.32s;
  }

  .dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }
`

export default DotLoader
